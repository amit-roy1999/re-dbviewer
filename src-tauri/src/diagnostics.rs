//! Local append-only diagnostics log (no network, privacy-safe writes).

use log::{Level, LevelFilter, Log, Metadata, Record};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_BYTES: u64 = (3 * 1024 * 1024) / 2; // 1.5 MiB
const TAIL_BYTES: u64 = 64 * 1024;
const MAX_LINE: usize = 500;

static LOG_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

struct FileLogger {
    path: PathBuf,
    file: Mutex<File>,
}

impl FileLogger {
    fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let file = open_append(path)?;
        Ok(Self {
            path: path.to_path_buf(),
            file: Mutex::new(file),
        })
    }

    fn write_line(&self, line: &str) {
        let safe = sanitize(line);
        let truncated = if safe.len() > MAX_LINE {
            format!("{}…", &safe[..MAX_LINE])
        } else {
            safe
        };
        let Ok(mut f) = self.file.lock() else {
            return;
        };
        if let Ok(meta) = f.metadata() {
            if meta.len() >= MAX_BYTES {
                let _ = f.flush();
                drop(f);
                let _ = rotate(&self.path);
                if let Ok(new_f) = open_append(&self.path) {
                    if let Ok(mut guard) = self.file.lock() {
                        *guard = new_f;
                        let _ = writeln!(guard, "{truncated}");
                        let _ = guard.flush();
                    }
                }
                return;
            }
        }
        let _ = writeln!(f, "{truncated}");
        let _ = f.flush();
    }
}

fn open_append(path: &Path) -> Result<File, String> {
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())
}

fn rotate(path: &Path) -> Result<(), String> {
    let bak = path.with_extension("log.1");
    let _ = fs::remove_file(&bak);
    if path.exists() {
        fs::rename(path, &bak).map_err(|e| e.to_string())?;
    }
    File::create(path).map_err(|e| e.to_string())?;
    Ok(())
}

impl Log for FileLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= Level::Info
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        self.write_line(&format!("{ts} [{}] {}", record.level(), record.args()));
    }

    fn flush(&self) {
        if let Ok(mut f) = self.file.lock() {
            let _ = f.flush();
        }
    }
}

/// Strip secrets / connection identity from log lines (safe-by-default export).
pub fn sanitize(input: &str) -> String {
    let mut s = input.to_string();
    for key in [
        "password=",
        "PASSWORD=",
        "Password=",
        "pwd=",
        "PWD=",
        "passwd=",
    ] {
        s = redact_after_key(&s, key);
    }
    for key in ["user=", "username=", "Username=", "USER="] {
        s = redact_after_key(&s, key);
    }
    for key in ["host=", "hostname=", "Host=", "server=", "Server="] {
        s = redact_after_key(&s, key);
    }
    redact_ipv4(&s)
}

fn redact_after_key(s: &str, key: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find(key) {
        out.push_str(&rest[..i]);
        out.push_str(key);
        out.push_str("***");
        rest = &rest[i + key.len()..];
        let end = rest
            .find(|c: char| {
                c.is_whitespace() || c == '&' || c == ';' || c == ',' || c == '"' || c == '\''
            })
            .unwrap_or(rest.len());
        rest = &rest[end..];
    }
    out.push_str(rest);
    out
}

fn redact_ipv4(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            if let Some(end) = match_ipv4(&s[i..]) {
                out.push_str("*.*.*.*");
                i += end;
                continue;
            }
        }
        let ch = s[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn match_ipv4(s: &str) -> Option<usize> {
    let mut parts = 0;
    let mut i = 0;
    let b = s.as_bytes();
    while parts < 4 {
        let start = i;
        let mut digits = 0;
        while i < b.len() && b[i].is_ascii_digit() && digits < 3 {
            i += 1;
            digits += 1;
        }
        if digits == 0 {
            return None;
        }
        let n: u32 = s[start..i].parse().ok()?;
        if n > 255 {
            return None;
        }
        parts += 1;
        if parts == 4 {
            return Some(i);
        }
        if i >= b.len() || b[i] != b'.' {
            return None;
        }
        i += 1;
    }
    None
}

/// Initialize file logger under `{data_dir}/logs/re-dbviewer.log`.
pub fn init(data_dir: &Path) -> Result<(), String> {
    let dir = data_dir.join("logs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("re-dbviewer.log");
    let logger = FileLogger::open(&path)?;
    if let Ok(mut g) = LOG_PATH.lock() {
        *g = Some(path);
    }
    log::set_boxed_logger(Box::new(logger)).map_err(|e| e.to_string())?;
    log::set_max_level(LevelFilter::Info);
    log::info!(
        "diagnostics started version={} os={} arch={}",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    Ok(())
}

fn log_path() -> Option<PathBuf> {
    LOG_PATH.lock().ok().and_then(|g| g.clone())
}

/// Append a frontend line (`level` = error|warn|info).
pub fn append(level: &str, message: &str) -> Result<(), String> {
    let msg = sanitize(message);
    match level.to_ascii_lowercase().as_str() {
        "error" => log::error!("[ui] {msg}"),
        "warn" | "warning" => log::warn!("[ui] {msg}"),
        _ => log::info!("[ui] {msg}"),
    }
    Ok(())
}

fn read_tail(path: &Path, max: u64) -> Result<String, String> {
    let mut f = File::open(path).map_err(|e| e.to_string())?;
    let len = f.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
    let start = len.saturating_sub(max);
    f.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let mut buf = String::new();
    f.read_to_string(&mut buf).map_err(|e| e.to_string())?;
    if start > 0 {
        if let Some(i) = buf.find('\n') {
            buf = buf[i + 1..].to_string();
        }
    }
    Ok(sanitize(&buf))
}

/// Privacy-safe diagnostics bundle for export (no SQL / host / user by policy).
pub fn read_bundle() -> Result<String, String> {
    let mut out = String::new();
    out.push_str("re-dbviewer diagnostics\n");
    out.push_str(&format!("version: {}\n", env!("CARGO_PKG_VERSION")));
    out.push_str(&format!(
        "os: {} {}\n",
        std::env::consts::OS,
        std::env::consts::ARCH
    ));
    out.push_str("engines: sqlite, postgres, mysql, mariadb, mssql\n");
    out.push_str(
        "privacy: passwords, SQL, hostnames, and usernames are omitted or redacted\n",
    );
    out.push_str("--- log ---\n");
    match log_path() {
        Some(path) if path.exists() => {
            out.push_str(&read_tail(&path, TAIL_BYTES)?);
        }
        _ => out.push_str("(no log file yet)\n"),
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_secrets_and_identity() {
        let s = sanitize("fail host=db.example.com user=alice password=secret 10.0.0.1");
        assert!(!s.contains("secret"));
        assert!(!s.contains("alice"));
        assert!(!s.contains("db.example.com"));
        assert!(s.contains("password=***"));
        assert!(s.contains("*.*.*.*"));
    }
}
