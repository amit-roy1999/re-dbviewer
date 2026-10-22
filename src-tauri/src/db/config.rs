use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub user: Option<String>,
    /// Cleared before persisting when the OS keyring accepts it.
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub database: Option<String>,
    #[serde(default)]
    pub ssl_mode: Option<String>,
    /// PEM paths. Postgres uses all three; MySQL uses CA only (mysql_async wants PKCS#12 for client certs).
    #[serde(default)]
    pub ssl_cert: Option<String>,
    #[serde(default)]
    pub ssl_key: Option<String>,
    #[serde(default)]
    pub ssl_ca: Option<String>,
    /// Unix socket path (MySQL socket file, or Postgres socket directory).
    #[serde(default)]
    pub socket_path: Option<String>,
    /// SSH tunnel via system `ssh -L` (key auth only).
    #[serde(default)]
    pub ssh_host: Option<String>,
    #[serde(default)]
    pub ssh_port: Option<u16>,
    #[serde(default)]
    pub ssh_user: Option<String>,
    #[serde(default)]
    pub ssh_key_path: Option<String>,
    /// True when the password lives in the OS keyring (never persisted in config_json).
    #[serde(default)]
    pub password_in_keyring: bool,
    /// True when the password lives in the encrypted app vault (fallback).
    #[serde(default)]
    pub password_in_vault: bool,
    /// Frontend hint: when false on save, clear any stored password. Not persisted meaningfully.
    #[serde(default = "default_store_password")]
    pub store_password: bool,
    /// When true, UI always confirms destructive / write SQL (production-safe).
    #[serde(default)]
    pub safe_mode: bool,
    /// Prefer ssh-agent keys (still BatchMode — agent must already hold the key).
    #[serde(default)]
    pub ssh_use_agent: bool,
}

fn default_store_password() -> bool {
    true
}

impl ConnectionConfig {
    pub fn sqlite_path(path: impl Into<String>) -> Self {
        Self {
            path: Some(path.into()),
            ..Default::default()
        }
    }

    pub fn ssl_enabled(&self) -> bool {
        !matches!(
            self.ssl_mode.as_deref().map(str::to_ascii_lowercase).as_deref(),
            None | Some("") | Some("disable") | Some("false")
        )
    }

    fn nonempty(v: &Option<String>) -> Option<&str> {
        v.as_deref().map(str::trim).filter(|s| !s.is_empty())
    }

    pub fn ssl_ca_path(&self) -> Option<&str> {
        Self::nonempty(&self.ssl_ca)
    }
    pub fn ssl_cert_path(&self) -> Option<&str> {
        Self::nonempty(&self.ssl_cert)
    }
    pub fn ssl_key_path(&self) -> Option<&str> {
        Self::nonempty(&self.ssl_key)
    }
    pub fn socket(&self) -> Option<&str> {
        Self::nonempty(&self.socket_path)
    }
    pub fn ssh_host_opt(&self) -> Option<&str> {
        Self::nonempty(&self.ssh_host)
    }

    pub fn path_or_err(&self) -> Result<&str, String> {
        self.path
            .as_deref()
            .filter(|p| !p.is_empty())
            .ok_or_else(|| "SQLite path is required".into())
    }

    pub fn host_or<'a>(&'a self, default: &'a str) -> &'a str {
        self.host.as_deref().filter(|h| !h.is_empty()).unwrap_or(default)
    }

    pub fn user_or<'a>(&'a self, default: &'a str) -> &'a str {
        self.user.as_deref().unwrap_or(default)
    }

    pub fn password_or<'a>(&'a self) -> &'a str {
        self.password.as_deref().unwrap_or("")
    }

    pub fn database_or<'a>(&'a self, default: &'a str) -> &'a str {
        self.database.as_deref().filter(|d| !d.is_empty()).unwrap_or(default)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_or_and_defaults() {
        let empty = ConnectionConfig::default();
        assert_eq!(empty.database_or("postgres"), "postgres");
        assert_eq!(empty.host_or("127.0.0.1"), "127.0.0.1");
        assert_eq!(empty.user_or("root"), "root");
        assert_eq!(empty.password_or(), "");

        let cfg = ConnectionConfig {
            database: Some("app".into()),
            host: Some("db.local".into()),
            user: Some("u".into()),
            password: Some("p".into()),
            ..Default::default()
        };
        assert_eq!(cfg.database_or("postgres"), "app");
        assert_eq!(cfg.host_or("127.0.0.1"), "db.local");
        assert_eq!(cfg.user_or("root"), "u");
        assert_eq!(cfg.password_or(), "p");

        let blank_db = ConnectionConfig {
            database: Some("".into()),
            ..Default::default()
        };
        assert_eq!(blank_db.database_or("main"), "main");
    }

    #[test]
    fn sqlite_path_and_ssl() {
        let cfg = ConnectionConfig::sqlite_path("/tmp/a.db");
        assert_eq!(cfg.path_or_err().unwrap(), "/tmp/a.db");
        assert!(!cfg.ssl_enabled());

        let ssl = ConnectionConfig {
            ssl_mode: Some("require".into()),
            ssl_ca: Some(" /ca.pem ".into()),
            ..Default::default()
        };
        assert!(ssl.ssl_enabled());
        assert_eq!(ssl.ssl_ca_path(), Some("/ca.pem"));

        let disabled = ConnectionConfig {
            ssl_mode: Some("disable".into()),
            ..Default::default()
        };
        assert!(!disabled.ssl_enabled());
    }

    #[test]
    fn serde_round_trip() {
        let cfg = ConnectionConfig {
            host: Some("localhost".into()),
            port: Some(5432),
            database: Some("db".into()),
            ..Default::default()
        };
        let json = serde_json::to_string(&cfg).unwrap();
        let back: ConnectionConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.host.as_deref(), Some("localhost"));
        assert_eq!(back.port, Some(5432));
        assert_eq!(back.database_or(""), "db");
    }

    #[test]
    fn password_storage_flags_serde_camel_case() {
        let cfg = ConnectionConfig {
            password_in_keyring: true,
            password_in_vault: false,
            store_password: false,
            ..Default::default()
        };
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("\"passwordInKeyring\":true"));
        assert!(json.contains("\"passwordInVault\":false"));
        assert!(json.contains("\"storePassword\":false"));
        let back: ConnectionConfig = serde_json::from_str(&json).unwrap();
        assert!(back.password_in_keyring);
        assert!(!back.password_in_vault);
        assert!(!back.store_password);

        let legacy: ConnectionConfig = serde_json::from_str(r#"{"host":"h"}"#).unwrap();
        assert!(!legacy.password_in_keyring);
        assert!(!legacy.password_in_vault);
        assert!(legacy.store_password); // default true
    }
}
