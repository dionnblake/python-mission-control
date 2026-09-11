mod runner;
mod storage;

use serde_json::{json, Value};
use std::{path::{Component, Path, PathBuf}, sync::{Arc, Mutex}};
use tauri::Manager;

#[derive(Default)]
struct RunnerGate(Arc<Mutex<()>>);

struct LocalProfile(Option<PathBuf>);

struct ProfileAccess {
    directory: Result<PathBuf, String>,
    lock: Mutex<Result<storage::ProfileLock, String>>,
}

impl ProfileAccess {
    fn new(directory: Result<PathBuf, String>) -> Self {
        let lock = directory.as_ref().map_err(Clone::clone)
            .and_then(|path| storage::ProfileLock::acquire(path));
        Self { directory, lock: Mutex::new(lock) }
    }

    fn progress_path(&self) -> Result<PathBuf, String> {
        let mut lock = self.lock.lock()
            .map_err(|_| "The learner profile lock failed. Restart the app.".to_string())?;
        if lock.is_err() {
            // A blocked startup may retry after the first window closes. Never
            // release a successful lock while this application's state is alive.
            *lock = self.directory.as_ref().map_err(Clone::clone)
                .and_then(|path| storage::ProfileLock::acquire(path));
        }
        lock.as_ref().map_err(Clone::clone)?;
        self.directory.as_ref().map(|path| path.join("progress.sqlite3")).map_err(Clone::clone)
    }
}

fn validate_profile_directory(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() || path.file_name().is_none()
        || path.components().any(|part| matches!(part, Component::ParentDir)) {
        return Err("PMC_PROFILE_DIR must be an absolute local directory below the drive root, without '..'.".into());
    }
    #[cfg(windows)]
    {
        use std::path::Prefix;
        if !matches!(path.components().next(), Some(Component::Prefix(prefix))
            if matches!(prefix.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_))) {
            return Err("PMC_PROFILE_DIR must be on a local Windows drive, not a network or device path.".into());
        }
        if path.components().any(|part| matches!(part, Component::Normal(name) if name.to_string_lossy().contains(':'))) {
            return Err("PMC_PROFILE_DIR must name a directory, not an alternate data stream.".into());
        }
    }
    if path.exists() && !path.is_dir() {
        return Err("PMC_PROFILE_DIR points to a file instead of a directory.".into());
    }
    Ok(path.to_path_buf())
}

fn profile_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(directory) = &app.state::<LocalProfile>().0 {
        return Ok(directory.clone());
    }
    app.path().app_data_dir()
        .map_err(|e| format!("Could not locate local application data: {e}"))
}

fn progress_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.try_state::<ProfileAccess>()
        .ok_or("The learner profile is still opening. Please retry.")?
        .progress_path()
}

#[tauri::command]
fn load_progress(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    storage::load(&progress_path(&app)?)
}

#[tauri::command]
fn save_progress(app: tauri::AppHandle, progress: Value) -> Result<(), String> {
    storage::save(&progress_path(&app)?, &progress)
}

#[tauri::command]
fn reset_progress(app: tauri::AppHandle, progress: Value) -> Result<(), String> {
    storage::reset(&progress_path(&app)?, &progress)
}

#[tauri::command]
async fn run_trace(app: tauri::AppHandle, gate: tauri::State<'_, RunnerGate>, code: String) -> Result<runner::TraceResult, String> {
    let resource_dir = app.path().resource_dir().map_err(|e| format!("Could not locate the Python runtime: {e}"))?;
    let guard = gate.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = guard.lock().map_err(|_| "Python Machine is unavailable. Restart the application.".to_string())?;
        runner::run(&resource_dir, &code)
    }).await.map_err(|e| format!("Python Machine could not finish: {e}"))?
}

#[tauri::command]
fn runtime_info(app: tauri::AppHandle) -> Result<Value, String> {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let (_, bundled) = runner::helper_command(&resource_dir)?;
    Ok(json!({"engine":"CPython", "bundled":bundled, "storage":"SQLite", "localOnly":true,
        "isolatedProfile":app.state::<LocalProfile>().0.is_some()}))
}

pub fn run() {
    // An explicit startup-only profile isolates both SQLite and WebView2 state.
    // The renderer cannot select paths or change profiles through IPC.
    let profile = std::env::var_os("PMC_PROFILE_DIR")
        .map(|value| validate_profile_directory(Path::new(&value)))
        .transpose().expect("Invalid isolated Python Mission Control profile");
    let mut context = tauri::generate_context!();
    let windows = context.config().app.windows.clone();
    // Hold the lock (or its visible failure) before any renderer can send IPC.
    for window in &mut context.config_mut().app.windows { window.create = false; }
    let webview_profile = profile.clone();
    tauri::Builder::default()
        .manage(RunnerGate::default())
        .manage(LocalProfile(profile))
        .setup(move |app| {
            app.manage(ProfileAccess::new(profile_directory(app.handle())));
            for config in &windows {
                let mut window = tauri::WebviewWindowBuilder::from_config(app, config)?;
                if let Some(directory) = &webview_profile {
                    let webview_data = directory.join("webview").join(&config.label);
                    std::fs::create_dir_all(&webview_data)?;
                    window = window.data_directory(webview_data);
                }
                window.build()?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_progress, save_progress, reset_progress, run_trace, runtime_info])
        .run(context)
        .expect("Python Mission Control could not start");
}

#[cfg(test)]
mod profile_tests {
    use super::*;

    #[test]
    fn profile_requires_an_absolute_local_directory_and_preserves_the_path() {
        let directory = tempfile::tempdir().unwrap();
        let profile = directory.path().join("test-profile");
        assert_eq!(validate_profile_directory(&profile).unwrap(), profile);
        assert!(!profile.exists());
        assert!(validate_profile_directory(Path::new("relative-profile")).is_err());
        assert!(validate_profile_directory(&directory.path().join("../other")).is_err());
        let file = directory.path().join("existing-file");
        std::fs::write(&file, "preserve").unwrap();
        assert!(validate_profile_directory(&file).is_err());
        assert_eq!(std::fs::read_to_string(file).unwrap(), "preserve");
    }

    #[test]
    #[cfg(windows)]
    fn network_and_drive_root_profiles_are_rejected() {
        assert!(validate_profile_directory(Path::new(r"\\server\share\profile")).is_err());
        assert!(validate_profile_directory(Path::new(r"C:\")).is_err());
        assert!(validate_profile_directory(Path::new(r"C:\profile:stream")).is_err());
    }

    #[test]
    fn blocked_profile_retries_after_the_first_window_releases_ownership() {
        let directory = tempfile::tempdir().unwrap();
        let first = ProfileAccess::new(Ok(directory.path().to_path_buf()));
        let second = ProfileAccess::new(Ok(directory.path().to_path_buf()));
        assert!(first.progress_path().is_ok());
        assert!(second.progress_path().unwrap_err().contains("already open"));
        assert!(second.progress_path().unwrap_err().contains("Retry connection"));
        drop(first);
        assert_eq!(second.progress_path().unwrap(), directory.path().join("progress.sqlite3"));
        let third = ProfileAccess::new(Ok(directory.path().to_path_buf()));
        assert!(third.progress_path().unwrap_err().contains("already open"));
    }
}
