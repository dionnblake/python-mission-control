use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde_json::Value;
use std::{fs, path::Path, time::Duration};

const MAX_PROGRESS_BYTES: usize = 8 * 1024 * 1024;

/// An OS-held lifetime lock. The marker may remain after exit; only its open
/// handle grants ownership, so a crash cannot leave a stale logical lock.
pub struct ProfileLock {
    _file: fs::File,
}

impl ProfileLock {
    pub fn acquire(directory: &Path) -> Result<Self, String> {
        fs::create_dir_all(directory).map_err(storage_error)?;
        let mut options = fs::OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(0);
        }
        let file = options.open(directory.join("profile.lock")).map_err(|error| {
            if matches!(error.raw_os_error(), Some(32 | 33)) {
                profile_in_use()
            } else {
                storage_error(format!("Could not reserve this learner profile: {error}"))
            }
        })?;
        #[cfg(not(windows))]
        file.try_lock().map_err(|_| profile_in_use())?;
        Ok(Self { _file: file })
    }
}

fn profile_in_use() -> String {
    "This learner profile is already open in another Python Mission Control window. Use that window, or close it and choose Retry connection here. Your saved progress has not been changed.".into()
}

fn storage_error(message: impl std::fmt::Display) -> String {
    format!("Local progress could not be accessed: {message}. Existing data has been preserved.")
}

fn validate(progress: &Value) -> Result<(), String> {
    let object = progress.as_object().ok_or("Progress must be a JSON object.")?;
    if object.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("Unsupported progress version. Existing data has been preserved.".into());
    }
    for key in ["startedAt", "xp", "sessions"] {
        if !object.get(key).is_some_and(Value::is_number) {
            return Err(format!("Progress is missing numeric {key}. Existing data has been preserved."));
        }
    }
    for key in ["onboardingComplete", "baselineComplete"] {
        if !object.get(key).is_some_and(Value::is_boolean) {
            return Err(format!("Progress is missing {key}. Existing data has been preserved."));
        }
    }
    for key in ["studyDays", "attempts", "exams"] {
        if !object.get(key).is_some_and(Value::is_array) {
            return Err(format!("Progress is missing list {key}. Existing data has been preserved."));
        }
    }
    for key in ["concepts", "settings"] {
        if !object.get(key).is_some_and(Value::is_object) {
            return Err(format!("Progress is missing object {key}. Existing data has been preserved."));
        }
    }
    Ok(())
}

fn parse_progress(text: &str) -> Result<Value, String> {
    if text.len() > MAX_PROGRESS_BYTES {
        return Err("Saved progress exceeds the supported size. Existing data has been preserved.".into());
    }
    let value: Value = serde_json::from_str(text).map_err(storage_error)?;
    validate(&value)?;
    Ok(value)
}

fn open(path: &Path) -> Result<Connection, String> {
    let existed = path.exists();
    if existed && fs::metadata(path).map_err(storage_error)?.len() == 0 {
        return Err("The saved progress database is empty. Existing data has been preserved.".into());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(storage_error)?;
    }
    let connection = Connection::open(path).map_err(storage_error)?;
    connection.busy_timeout(Duration::from_secs(3)).map_err(storage_error)?;
    connection.execute_batch("PRAGMA synchronous=FULL;").map_err(storage_error)?;
    if !existed {
        connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS snapshots (
           name TEXT PRIMARY KEY CHECK(name IN ('current', 'previous')),
           data TEXT NOT NULL
         );",
    ).map_err(storage_error)?;
    } else {
        // An existing database with a missing schema is an error, never a new
        // learner profile. Do not create replacement tables in a damaged file.
        connection.prepare("SELECT name, data FROM snapshots LIMIT 1").map_err(storage_error)?;
    }
    Ok(connection)
}

fn current_snapshot(connection: &Connection) -> Result<Option<String>, String> {
    let current: Option<String> = connection.query_row(
        "SELECT data FROM snapshots WHERE name='current'", [], |row| row.get(0),
    ).optional().map_err(storage_error)?;
    if current.is_none() {
        let snapshots: i64 = connection.query_row(
            "SELECT count(*) FROM snapshots", [], |row| row.get(0),
        ).map_err(storage_error)?;
        if snapshots > 0 {
            return Err("The current progress snapshot is missing, but recovery data exists. Existing data has been preserved; recover the previous snapshot before continuing.".into());
        }
    }
    Ok(current)
}

pub fn load(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let connection = open(path)?;
    let current = current_snapshot(&connection)?;
    current.map(|text| parse_progress(&text)).transpose()
}

pub fn save(path: &Path, progress: &Value) -> Result<(), String> {
    validate(progress)?;
    let serialized = serde_json::to_string(progress).map_err(storage_error)?;
    if serialized.len() > MAX_PROGRESS_BYTES {
        return Err("Progress is too large to save. Existing data has been preserved.".into());
    }
    let mut connection = open(path)?;
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(storage_error)?;
    let current = current_snapshot(&transaction)?;
    if let Some(previous) = current {
        // Validate the existing snapshot before replacing anything. Corruption
        // must never turn into an apparently successful first launch/reset.
        parse_progress(&previous)?;
        transaction.execute("INSERT OR REPLACE INTO snapshots(name,data) VALUES ('previous',?1)", [&previous]).map_err(storage_error)?;
    }
    transaction.execute("INSERT OR REPLACE INTO snapshots(name,data) VALUES ('current',?1)", params![serialized]).map_err(storage_error)?;
    transaction.commit().map_err(storage_error)
}

/// Replace the learner snapshot for an explicit master reset. Unlike a normal
/// save, this intentionally removes the recovery snapshot so the old profile
/// cannot be restored from the database after confirmation.
pub fn reset(path: &Path, progress: &Value) -> Result<(), String> {
    validate(progress)?;
    let serialized = serde_json::to_string(progress).map_err(storage_error)?;
    if serialized.len() > MAX_PROGRESS_BYTES {
        return Err("Progress is too large to save. Existing data has been preserved.".into());
    }
    let mut connection = open(path)?;
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(storage_error)?;
    if let Some(current) = current_snapshot(&transaction)? {
        // A reset must not hide corruption behind a new first-run profile.
        parse_progress(&current)?;
    }
    transaction.execute("DELETE FROM snapshots WHERE name IN ('current','previous')", []).map_err(storage_error)?;
    transaction.execute("INSERT INTO snapshots(name,data) VALUES ('current',?1)", params![serialized]).map_err(storage_error)?;
    transaction.commit().map_err(storage_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn progress(xp: u32) -> Value {
        json!({"version":1,"startedAt":123,"xp":xp,"sessions":0,
            "onboardingComplete":false,"baselineComplete":false,"studyDays":[],
            "attempts":[],"exams":[],"concepts":{},"settings":{}})
    }

    #[test]
    fn new_database_is_empty_and_progress_survives_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("progress.sqlite3");
        assert_eq!(load(&path).unwrap(), None);
        save(&path, &progress(42)).unwrap();
        assert_eq!(load(&path).unwrap(), Some(progress(42)));
    }

    #[test]
    fn transaction_preserves_previous_valid_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("progress.sqlite3");
        save(&path, &progress(10)).unwrap();
        save(&path, &progress(20)).unwrap();
        assert_eq!(load(&path).unwrap(), Some(progress(20)));
        let connection = Connection::open(path).unwrap();
        let previous: String = connection.query_row("SELECT data FROM snapshots WHERE name='previous'", [], |row| row.get(0)).unwrap();
        assert_eq!(parse_progress(&previous).unwrap(), progress(10));
    }

    #[test]
    fn master_reset_replaces_current_and_removes_recovery_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("progress.sqlite3");
        save(&path, &progress(10)).unwrap();
        save(&path, &progress(20)).unwrap();
        reset(&path, &progress(0)).unwrap();
        assert_eq!(load(&path).unwrap(), Some(progress(0)));
        let connection = Connection::open(path).unwrap();
        let previous_count: i64 = connection.query_row(
            "SELECT count(*) FROM snapshots WHERE name='previous'",
            [],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(previous_count, 0);
    }

    #[test]
    fn master_reset_preserves_a_corrupt_current_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("progress.sqlite3");
        save(&path, &progress(42)).unwrap();
        Connection::open(&path).unwrap().execute(
            "UPDATE snapshots SET data='bad-json' WHERE name='current'",
            [],
        ).unwrap();
        assert!(reset(&path, &progress(0)).is_err());
        let data: String = Connection::open(path).unwrap().query_row(
            "SELECT data FROM snapshots WHERE name='current'",
            [],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(data, "bad-json");
    }

    #[test]
    fn invalid_new_progress_cannot_overwrite_saved_progress() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("progress.sqlite3");
        save(&path, &progress(42)).unwrap();
        assert!(save(&path, &json!({"version": 2})).is_err());
        assert_eq!(load(&path).unwrap(), Some(progress(42)));
    }

    #[test]
    fn corrupt_snapshot_fails_load_and_save_without_replacing_it() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("progress.sqlite3");
        save(&path, &progress(42)).unwrap();
        Connection::open(&path).unwrap().execute("UPDATE snapshots SET data='bad-json' WHERE name='current'", []).unwrap();
        assert!(load(&path).unwrap_err().contains("preserved"));
        assert!(save(&path, &progress(100)).is_err());
        let data: String = Connection::open(path).unwrap().query_row("SELECT data FROM snapshots WHERE name='current'", [], |row| row.get(0)).unwrap();
        assert_eq!(data, "bad-json");
    }

    #[test]
    fn corrupt_database_bytes_remain_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("progress.sqlite3");
        fs::write(&path, b"damaged database evidence").unwrap();
        assert!(load(&path).is_err());
        assert!(save(&path, &progress(2)).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"damaged database evidence");
    }

    #[test]
    fn existing_empty_file_is_not_silently_initialized() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("progress.sqlite3");
        fs::write(&path, b"").unwrap();
        assert!(load(&path).is_err());
        assert!(save(&path, &progress(2)).is_err());
        assert_eq!(fs::metadata(path).unwrap().len(), 0);
    }

    #[test]
    fn existing_unrecognized_schema_is_not_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("progress.sqlite3");
        Connection::open(&path).unwrap().execute_batch("CREATE TABLE unrelated(data TEXT); INSERT INTO unrelated VALUES('preserve');").unwrap();
        assert!(load(&path).is_err());
        assert!(save(&path, &progress(2)).is_err());
        let count: i64 = Connection::open(path).unwrap().query_row("SELECT count(*) FROM sqlite_master WHERE name='snapshots'", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn missing_current_never_discards_the_only_recovery_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("progress.sqlite3");
        save(&path, &progress(10)).unwrap();
        save(&path, &progress(20)).unwrap();
        let connection = Connection::open(&path).unwrap();
        let previous: String = connection.query_row("SELECT data FROM snapshots WHERE name='previous'", [], |row| row.get(0)).unwrap();
        connection.execute("DELETE FROM snapshots WHERE name='current'", []).unwrap();
        drop(connection);
        assert!(load(&path).unwrap_err().contains("recovery data exists"));
        assert!(save(&path, &progress(0)).unwrap_err().contains("recovery data exists"));
        let connection = Connection::open(&path).unwrap();
        let retained: String = connection.query_row("SELECT data FROM snapshots WHERE name='previous'", [], |row| row.get(0)).unwrap();
        assert_eq!(retained, previous);
        let current_count: i64 = connection.query_row("SELECT count(*) FROM snapshots WHERE name='current'", [], |row| row.get(0)).unwrap();
        assert_eq!(current_count, 0);
    }

    #[test]
    fn duplicate_profile_is_blocked_without_touching_the_first_instances_progress() {
        let directory = tempfile::tempdir().unwrap();
        let first = ProfileLock::acquire(directory.path()).unwrap();
        let path = directory.path().join("progress.sqlite3");
        save(&path, &progress(42)).unwrap();
        let duplicate = ProfileLock::acquire(directory.path());
        assert!(duplicate.err().unwrap().contains("already open"));
        assert_eq!(load(&path).unwrap(), Some(progress(42)));
        // Keeping the first handle does not prevent its ordinary SQLite saves.
        save(&path, &progress(43)).unwrap();
        drop(first);
        let _reopened = ProfileLock::acquire(directory.path()).unwrap();
        assert_eq!(load(&path).unwrap(), Some(progress(43)));
    }

    #[test]
    fn distinct_isolated_profiles_can_remain_open_together() {
        let directory = tempfile::tempdir().unwrap();
        let first = directory.path().join("first");
        let second = directory.path().join("second");
        let _first_lock = ProfileLock::acquire(&first).unwrap();
        let _second_lock = ProfileLock::acquire(&second).unwrap();
        save(&first.join("progress.sqlite3"), &progress(10)).unwrap();
        save(&second.join("progress.sqlite3"), &progress(20)).unwrap();
        assert_eq!(load(&first.join("progress.sqlite3")).unwrap(), Some(progress(10)));
        assert_eq!(load(&second.join("progress.sqlite3")).unwrap(), Some(progress(20)));
    }

    #[test]
    fn leftover_marker_does_not_lock_a_profile_or_lose_existing_marker_contents() {
        let directory = tempfile::tempdir().unwrap();
        let marker = directory.path().join("profile.lock");
        fs::write(&marker, "preserve marker").unwrap();
        let acquired = ProfileLock::acquire(directory.path()).unwrap();
        drop(acquired);
        assert_eq!(fs::read_to_string(marker).unwrap(), "preserve marker");
    }
}
