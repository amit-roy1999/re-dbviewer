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
    /// ponytail: plaintext local store; OS keyring if shared machine
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub database: Option<String>,
    #[serde(default)]
    pub ssl_mode: Option<String>,
}

impl ConnectionConfig {
    pub fn sqlite_path(path: impl Into<String>) -> Self {
        Self {
            path: Some(path.into()),
            ..Default::default()
        }
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
