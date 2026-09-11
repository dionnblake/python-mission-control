use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    path::Path,
    process::{Command, Stdio},
    sync::{atomic::{AtomicBool, Ordering}, Arc},
    thread,
    time::{Duration, Instant},
};
#[cfg(debug_assertions)]
use std::path::PathBuf;

const MAX_CODE_BYTES: usize = 64_000;
const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
const HARD_TIMEOUT: Duration = Duration::from_secs(6);

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceResult {
    pub events: Vec<TraceEvent>,
    pub output: String,
    pub error: Option<TraceError>,
    pub truncated: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TraceError {
    #[serde(rename = "type")]
    pub kind: String,
    pub message: String,
    pub line: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceEvent {
    pub step: u32,
    pub event: EventKind,
    pub line: u32,
    pub function: String,
    pub locals: BTreeMap<String, String>,
    pub globals: BTreeMap<String, String>,
    pub changes: Vec<TraceChange>,
    pub output: String,
    pub stack: Vec<TraceFrame>,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iteration: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<BTreeMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_value: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EventKind { Line, Call, Return, Exception, Branch, Loop }

#[derive(Debug, Serialize, Deserialize)]
pub struct TraceChange {
    pub name: String,
    pub before: Option<String>,
    pub after: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TraceFrame {
    pub function: String,
    pub line: u32,
    pub locals: BTreeMap<String, String>,
}

pub fn parse_trace(bytes: &[u8]) -> Result<TraceResult, String> {
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("Python Machine returned too much trace data.".into());
    }
    let result: TraceResult = serde_json::from_slice(bytes)
        .map_err(|_| "Python Machine returned an invalid trace response. Try again.".to_string())?;
    if result.events.len() > 400 || result.output.len() > 48_000 {
        return Err("Python Machine exceeded its trace or output limit.".into());
    }
    for (index, event) in result.events.iter().enumerate() {
        if event.step as usize != index + 1 || event.line == 0 || event.stack.len() > 12 {
            return Err("Python Machine returned an inconsistent trace.".into());
        }
    }
    Ok(result)
}

fn reader(mut stream: impl Read + Send + 'static, limit: usize, overflow: Arc<AtomicBool>) -> thread::JoinHandle<Result<Vec<u8>, String>> {
    thread::spawn(move || {
        let mut data = Vec::new();
        let mut buffer = [0_u8; 8192];
        loop {
            let count = stream.read(&mut buffer).map_err(|e| format!("Unable to read the Python helper: {e}"))?;
            if count == 0 { return Ok(data); }
            if data.len() + count > limit {
                overflow.store(true, Ordering::SeqCst);
                return Err("Python helper output limit reached.".into());
            }
            data.extend_from_slice(&buffer[..count]);
        }
    })
}

// The command and fixed arguments are created only by Rust, never by the renderer.
fn run_process(mut command: Command, input: &[u8], timeout: Duration, output_limit: usize) -> Result<Vec<u8>, String> {
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = command.spawn().map_err(|e| format!("Could not start the local Python runtime: {e}. Rebuild or reinstall the application."))?;
    let mut stdin = child.stdin.take().ok_or("Python helper input was unavailable.")?;
    let payload = input.to_vec();
    let input_thread = thread::spawn(move || stdin.write_all(&payload));
    let overflow = Arc::new(AtomicBool::new(false));
    let output_thread = reader(child.stdout.take().ok_or("Python helper output was unavailable.")?, output_limit, overflow.clone());
    let error_thread = reader(child.stderr.take().ok_or("Python helper errors were unavailable.")?, 16_384, overflow.clone());
    let started = Instant::now();
    let mut forced_error = None;
    let status = loop {
        if started.elapsed() >= timeout || overflow.load(Ordering::SeqCst) {
            forced_error = Some(if overflow.load(Ordering::SeqCst) {
                "Python helper exceeded its output limit. Execution stopped.".to_string()
            } else {
                "Python execution timed out. Execution stopped; check for an infinite loop.".to_string()
            });
            let _ = child.kill();
            break child.wait();
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => thread::sleep(Duration::from_millis(10)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(error);
            }
        }
    };
    // Reaping before joining closes every pipe even when the helper did not read
    // its input or stopped midway through output. No background child is retained.
    let wrote = input_thread.join();
    let output = output_thread.join();
    let errors = error_thread.join();
    if let Some(error) = forced_error { return Err(error); }
    if overflow.load(Ordering::SeqCst) {
        return Err("Python helper exceeded its output limit. Execution stopped.".into());
    }
    let status = status.map_err(|e| format!("Could not wait for Python: {e}"))?;
    let errors = errors.map_err(|_| "Python error reader failed.")??;
    if !status.success() {
        let detail = String::from_utf8_lossy(&errors);
        return Err(format!("Python runtime stopped unexpectedly ({status}): {}", detail.chars().take(500).collect::<String>()));
    }
    wrote.map_err(|_| "Python input writer failed.")?.map_err(|e| format!("Could not send the controlled code to Python: {e}"))?;
    output.map_err(|_| "Python output reader failed.".to_string())?
}

pub fn helper_command(resource_dir: &Path) -> Result<(Command, bool), String> {
    let executable = resource_dir.join("mission-python").join(if cfg!(windows) { "mission-python.exe" } else { "mission-python" });
    if executable.is_file() {
        return Ok((Command::new(executable), true));
    }
    #[cfg(debug_assertions)]
    {
        let development_bundle = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/mission-python").join(if cfg!(windows) { "mission-python.exe" } else { "mission-python" });
        if development_bundle.is_file() {
            return Ok((Command::new(development_bundle), true));
        }
        let mut command = Command::new(if cfg!(windows) { "python" } else { "python3" });
        command.args(["-I", "-B"]).arg(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../python/runner.py"));
        Ok((command, false))
    }
    #[cfg(not(debug_assertions))]
    Err("The bundled Python runtime is missing. Reinstall Python Mission Control.".into())
}

pub fn run(resource_dir: &Path, code: &str) -> Result<TraceResult, String> {
    if code.len() > MAX_CODE_BYTES || code.chars().count() > 16_000 {
        return Err("Study snippets must contain at most 16,000 characters.".into());
    }
    let (mut command, _) = helper_command(resource_dir)?;
    command.env_remove("PYTHONPATH").env_remove("PYTHONHOME");
    let input = serde_json::to_vec(&serde_json::json!({ "code": code })).map_err(|e| e.to_string())?;
    let bytes = run_process(command, &input, HARD_TIMEOUT, MAX_RESPONSE_BYTES)?;
    parse_trace(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn python(source: &str) -> Command {
        let mut command = Command::new(if cfg!(windows) { "python" } else { "python3" });
        command.args(["-I", "-c", source]);
        command
    }

    #[test]
    fn parses_real_controlled_helper_response() {
        let result = run(Path::new("not-a-resource-directory"), "x = 4\nx += 3\nprint(x)").unwrap();
        assert_eq!(result.output, "7\n");
        assert_eq!(result.events[0].locals.get("x").unwrap(), "4");
        assert!(result.error.is_none());
    }

    #[test]
    fn syntax_errors_are_results_not_native_failures() {
        let result = run(Path::new("not-a-resource-directory"), "if True\n    print(1)").unwrap();
        assert_eq!(result.error.unwrap().kind, "SyntaxError");
    }

    #[test]
    fn rejects_malformed_trace_protocol() {
        assert!(parse_trace(b"garbage").is_err());
        assert!(parse_trace(br#"{"events":[],"output":1,"error":null,"truncated":false}"#).is_err());
        assert!(parse_trace(br#"{"events":[],"output":"","error":null,"truncated":false}"#).is_ok());
    }

    #[test]
    fn hard_timeout_kills_and_reaps_a_noncooperative_helper() {
        let started = Instant::now();
        let error = run_process(python("import time; time.sleep(20)"), b"", Duration::from_millis(150), 1024).unwrap_err();
        assert!(error.contains("timed out"));
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn output_limit_stops_a_noisy_helper() {
        let error = run_process(python("import sys; sys.stdout.write('x' * 1000000); sys.stdout.flush()"), b"", Duration::from_secs(3), 1024).unwrap_err();
        assert!(error.contains("output limit"));
    }

    #[test]
    fn nonzero_exit_is_a_visible_error() {
        let error = run_process(python("import sys; sys.stderr.write('runtime failure'); sys.exit(7)"), b"", Duration::from_secs(3), 1024).unwrap_err();
        assert!(error.contains("runtime failure"));
    }
}
