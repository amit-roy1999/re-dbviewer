use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

use super::config::ConnectionConfig;
use super::permissions::Permissions;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedConnection {
    pub id: String,
    pub name: String,
    pub engine: String,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub is_favorite: bool,
    pub config: ConnectionConfig,
    pub permissions: Permissions,
}

pub struct AppStore {
    conn: Connection,
    data_dir: PathBuf,
}

impl AppStore {
    pub fn open(data_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        let db_path = data_dir.join("app.sqlite");
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        let store = Self { conn, data_dir };
        store.migrate()?;
        store.seed_starter_if_empty()?;
        Ok(store)
    }

    fn migrate(&self) -> Result<(), String> {
        self.conn
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS categories (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    sort_order INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS connections (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    engine TEXT NOT NULL,
                    path TEXT,
                    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    config_json TEXT,
                    permissions_json TEXT
                );",
            )
            .map_err(|e| e.to_string())?;

        // Add new columns if upgrading from v1
        let _ = self
            .conn
            .execute("ALTER TABLE connections ADD COLUMN category_id TEXT", []);
        let _ = self.conn.execute(
            "ALTER TABLE connections ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
            [],
        );
        let _ = self
            .conn
            .execute("ALTER TABLE connections ADD COLUMN config_json TEXT", []);
        let _ = self.conn.execute(
            "ALTER TABLE connections ADD COLUMN permissions_json TEXT",
            [],
        );

        // Migrate path → config_json
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, path FROM connections
                 WHERE (config_json IS NULL OR config_json = '') AND path IS NOT NULL AND path != ''",
            )
            .map_err(|e| e.to_string())?;
        let legacy: Vec<(String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);

        let full_perms = serde_json::to_string(&Permissions::default()).map_err(|e| e.to_string())?;
        for (id, path) in legacy {
            let cfg = serde_json::to_string(&ConnectionConfig::sqlite_path(&path))
                .map_err(|e| e.to_string())?;
            self.conn
                .execute(
                    "UPDATE connections SET config_json = ?1, permissions_json = COALESCE(permissions_json, ?2) WHERE id = ?3",
                    params![cfg, full_perms, id],
                )
                .map_err(|e| e.to_string())?;
        }

        self.conn
            .execute(
                "UPDATE connections SET permissions_json = ?1 WHERE permissions_json IS NULL OR permissions_json = ''",
                params![full_perms],
            )
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    fn seed_starter_if_empty(&self) -> Result<(), String> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM connections", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if count > 0 {
            return Ok(());
        }

        let starter_path = self.data_dir.join("starter.sqlite");
        create_starter_db(&starter_path)?;
        let id = Uuid::new_v4().to_string();
        let cfg = ConnectionConfig::sqlite_path(starter_path.to_string_lossy());
        let cfg_json = serde_json::to_string(&cfg).map_err(|e| e.to_string())?;
        let perms_json =
            serde_json::to_string(&Permissions::default()).map_err(|e| e.to_string())?;
        self.conn
            .execute(
                "INSERT INTO connections (id, name, engine, path, category_id, is_favorite, config_json, permissions_json)
                 VALUES (?1, ?2, 'sqlite', ?3, NULL, 1, ?4, ?5)",
                params![
                    id,
                    "Starter SQLite",
                    starter_path.to_string_lossy().to_string(),
                    cfg_json,
                    perms_json
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn map_row(r: &rusqlite::Row<'_>) -> Result<SavedConnection, rusqlite::Error> {
        let config_json: Option<String> = r.get(6)?;
        let permissions_json: Option<String> = r.get(7)?;
        let path: Option<String> = r.get(8)?;
        let config = if let Some(j) = config_json.filter(|s| !s.is_empty()) {
            serde_json::from_str(&j).unwrap_or_default()
        } else if let Some(p) = path {
            ConnectionConfig::sqlite_path(p)
        } else {
            ConnectionConfig::default()
        };
        let permissions = permissions_json
            .as_deref()
            .and_then(|j| serde_json::from_str(j).ok())
            .unwrap_or_default();
        let fav: i64 = r.get(5)?;
        Ok(SavedConnection {
            id: r.get(0)?,
            name: r.get(1)?,
            engine: r.get(2)?,
            category_id: r.get(3)?,
            category_name: r.get(4)?,
            is_favorite: fav != 0,
            config,
            permissions,
        })
    }

    pub fn list(&self) -> Result<Vec<SavedConnection>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT c.id, c.name, c.engine, c.category_id, cat.name,
                        c.is_favorite, c.config_json, c.permissions_json, c.path
                 FROM connections c
                 LEFT JOIN categories cat ON cat.id = c.category_id
                 ORDER BY c.is_favorite DESC, c.name COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], Self::map_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get(&self, id: &str) -> Result<SavedConnection, String> {
        self.conn
            .query_row(
                "SELECT c.id, c.name, c.engine, c.category_id, cat.name,
                        c.is_favorite, c.config_json, c.permissions_json, c.path
                 FROM connections c
                 LEFT JOIN categories cat ON cat.id = c.category_id
                 WHERE c.id = ?1",
                params![id],
                Self::map_row,
            )
            .map_err(|e| e.to_string())
    }

    pub fn save(
        &self,
        name: &str,
        engine: &str,
        category_id: Option<&str>,
        is_favorite: bool,
        config: &ConnectionConfig,
        permissions: &Permissions,
    ) -> Result<SavedConnection, String> {
        validate_engine(engine)?;
        let id = Uuid::new_v4().to_string();
        let cfg_json = serde_json::to_string(config).map_err(|e| e.to_string())?;
        let perms_json = serde_json::to_string(permissions).map_err(|e| e.to_string())?;
        let path = config.path.clone();
        self.conn
            .execute(
                "INSERT INTO connections (id, name, engine, path, category_id, is_favorite, config_json, permissions_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    id,
                    name,
                    engine,
                    path,
                    category_id,
                    if is_favorite { 1 } else { 0 },
                    cfg_json,
                    perms_json
                ],
            )
            .map_err(|e| e.to_string())?;
        self.get(&id)
    }

    pub fn update(
        &self,
        id: &str,
        name: &str,
        engine: &str,
        category_id: Option<&str>,
        is_favorite: bool,
        config: &ConnectionConfig,
        permissions: &Permissions,
    ) -> Result<(), String> {
        validate_engine(engine)?;
        let cfg_json = serde_json::to_string(config).map_err(|e| e.to_string())?;
        let perms_json = serde_json::to_string(permissions).map_err(|e| e.to_string())?;
        let n = self
            .conn
            .execute(
                "UPDATE connections SET name=?1, engine=?2, path=?3, category_id=?4,
                 is_favorite=?5, config_json=?6, permissions_json=?7 WHERE id=?8",
                params![
                    name,
                    engine,
                    config.path,
                    category_id,
                    if is_favorite { 1 } else { 0 },
                    cfg_json,
                    perms_json,
                    id
                ],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("connection not found".into());
        }
        Ok(())
    }

    pub fn set_favorite(&self, id: &str, is_favorite: bool) -> Result<(), String> {
        let n = self
            .conn
            .execute(
                "UPDATE connections SET is_favorite = ?1 WHERE id = ?2",
                params![if is_favorite { 1 } else { 0 }, id],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("connection not found".into());
        }
        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM connections WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_categories(&self) -> Result<Vec<Category>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, sort_order FROM categories ORDER BY sort_order, name")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Category {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    sort_order: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn save_category(&self, name: &str) -> Result<Category, String> {
        let id = Uuid::new_v4().to_string();
        let sort: i64 = self
            .conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories",
                [],
                |r| r.get(0),
            )
            .unwrap_or(1);
        self.conn
            .execute(
                "INSERT INTO categories (id, name, sort_order) VALUES (?1, ?2, ?3)",
                params![id, name.trim(), sort],
            )
            .map_err(|e| e.to_string())?;
        Ok(Category {
            id,
            name: name.trim().to_string(),
            sort_order: sort,
        })
    }

    pub fn rename_category(&self, id: &str, name: &str) -> Result<(), String> {
        let n = self
            .conn
            .execute(
                "UPDATE categories SET name = ?1 WHERE id = ?2",
                params![name.trim(), id],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("category not found".into());
        }
        Ok(())
    }

    pub fn delete_category(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE connections SET category_id = NULL WHERE category_id = ?1",
                params![id],
            )
            .map_err(|e| e.to_string())?;
        self.conn
            .execute("DELETE FROM categories WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn validate_engine(engine: &str) -> Result<(), String> {
    match engine {
        "sqlite" | "postgres" | "mysql" | "mariadb" | "mssql" => Ok(()),
        _ => Err(format!("unsupported engine: {engine}")),
    }
}

fn create_starter_db(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT
        );
        CREATE TABLE notes (
            id INTEGER PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            title TEXT NOT NULL,
            body TEXT
        );
        INSERT INTO users (name, email) VALUES
            ('Ada Lovelace', 'ada@example.com'),
            ('Alan Turing', 'alan@example.com'),
            ('Grace Hopper', 'grace@example.com');
        INSERT INTO notes (user_id, title, body) VALUES
            (1, 'Algorithms', 'Notes on analytical engine'),
            (2, 'Enigma', 'Breaking codes'),
            (3, 'COBOL', 'Business oriented language');",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
