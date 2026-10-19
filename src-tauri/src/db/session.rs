use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use super::app_store::SavedConnection;
use super::config::ConnectionConfig;
use super::engines::{mssql, mysql, postgres, sqlite};
use super::permissions::assert_sql_allowed;
use super::tunnel::{maybe_tunnel, Tunnel};
use super::transfer::{
    parse_csv, rows_to_csv, rows_to_inserts, split_sql_statements, synthesize_create,
    EXPORT_CHUNK, EXPORT_ROW_CAP, IMPORT_BYTES_CAP,
};
use super::types::{
    quote_ident, quote_ident_mysql, QueryResult, SchemaNode, TableDetails, TableFilter, TableSort,
};

enum LiveDb {
    Sqlite(rusqlite::Connection),
    Postgres(tokio_postgres::Client),
    Mysql(mysql_async::Conn),
    Mssql(mssql::MssqlClient),
}

struct OpenSession {
    connection: SavedConnection,
    // field order matters: db drops before the tunnel it rides on
    db: LiveDb,
    _tunnel: Option<Tunnel>,
}

/// Several open connections keyed by saved-connection id; one is "active" and is what
/// commands without an explicit `connection_id` operate on.
pub struct SessionState {
    sessions: Mutex<HashMap<String, Arc<Mutex<OpenSession>>>>,
    active: Mutex<Option<String>>,
}

impl SessionState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            active: Mutex::new(None),
        }
    }

    /// Opens (or re-opens) a connection and makes it active.
    pub fn open(&self, connection: SavedConnection) -> Result<(), String> {
        let (cfg, tunnel) = maybe_tunnel(&connection.engine, &connection.config)?;
        let db = open_engine(&connection.engine, &cfg)?;
        let id = connection.id.clone();
        let sess = Arc::new(Mutex::new(OpenSession {
            connection,
            db,
            _tunnel: tunnel,
        }));
        self.sessions
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id.clone(), sess);
        *self.active.lock().map_err(|e| e.to_string())? = Some(id);
        Ok(())
    }

    /// Closes the given connection, or the active one when `id` is None.
    pub fn close_id(&self, id: Option<&str>) -> Result<(), String> {
        let target = match id {
            Some(i) => Some(i.to_string()),
            None => self.active.lock().map_err(|e| e.to_string())?.clone(),
        };
        let Some(target) = target else { return Ok(()) };
        let mut map = self.sessions.lock().map_err(|e| e.to_string())?;
        map.remove(&target);
        let mut active = self.active.lock().map_err(|e| e.to_string())?;
        if active.as_deref() == Some(target.as_str()) {
            *active = map.keys().next().cloned();
        }
        Ok(())
    }

    #[cfg(test)]
    pub fn close(&self) -> Result<(), String> {
        self.close_id(None)
    }

    pub fn set_active(&self, id: &str) -> Result<(), String> {
        if !self
            .sessions
            .lock()
            .map_err(|e| e.to_string())?
            .contains_key(id)
        {
            return Err(format!("connection {id} is not open"));
        }
        *self.active.lock().map_err(|e| e.to_string())? = Some(id.to_string());
        Ok(())
    }

    pub fn open_ids(&self) -> Vec<String> {
        self.sessions
            .lock()
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default()
    }

    fn with_target<T>(
        &self,
        id: Option<&str>,
        f: impl FnOnce(&SavedConnection, &mut LiveDb) -> Result<T, String>,
    ) -> Result<T, String> {
        let key = match id {
            Some(i) => i.to_string(),
            None => self
                .active
                .lock()
                .map_err(|e| e.to_string())?
                .clone()
                .ok_or_else(|| "no connection open".to_string())?,
        };
        let arc = self
            .sessions
            .lock()
            .map_err(|e| e.to_string())?
            .get(&key)
            .cloned()
            .ok_or_else(|| format!("connection {key} is not open"))?;
        let mut session = arc.lock().map_err(|e| e.to_string())?;
        let OpenSession { connection, db, .. } = &mut *session;
        f(connection, db)
    }

    fn with_mut<T>(
        &self,
        f: impl FnOnce(&SavedConnection, &mut LiveDb) -> Result<T, String>,
    ) -> Result<T, String> {
        self.with_target(None, f)
    }

    pub fn list_schema_on(&self, id: Option<&str>) -> Result<Vec<SchemaNode>, String> {
        self.with_target(id, |_, db| match db {
            LiveDb::Sqlite(c) => sqlite::list_schema(c),
            LiveDb::Postgres(c) => block_on(postgres::list_schema(c)),
            LiveDb::Mysql(c) => block_on(mysql::list_schema(c)),
            LiveDb::Mssql(c) => block_on(mssql::list_schema(c)),
        })
    }

    pub fn describe_table_on(&self, id: Option<&str>, table: &str) -> Result<TableDetails, String> {
        self.with_target(id, |conn, db| {
            assert_sql_allowed(&conn.permissions, "SELECT 1")?;
            describe_table_inner(db, table)
        })
    }

    pub fn preview_table(
        &self,
        table: &str,
        limit: u32,
        offset: u32,
        filters: &[TableFilter],
        sort: Option<&TableSort>,
    ) -> Result<QueryResult, String> {
        self.with_mut(|conn, db| {
            assert_sql_allowed(&conn.permissions, "SELECT 1")?;
            preview_table_inner(db, table, limit, offset, filters, sort)
        })
    }

    pub fn run_sql_on(&self, id: Option<&str>, sql: &str) -> Result<QueryResult, String> {
        let trimmed = sql.trim();
        if trimmed.is_empty() {
            return Err("empty SQL".into());
        }
        self.with_target(id, |conn, db| {
            assert_sql_allowed(&conn.permissions, trimmed)?;
            run_sql_inner(db, trimmed)
        })
    }

    pub fn export_table_csv(
        &self,
        table: &str,
        filters: &[TableFilter],
        sort: Option<&TableSort>,
    ) -> Result<String, String> {
        let result = self.fetch_all(table, filters, sort)?;
        Ok(rows_to_csv(&result))
    }

    #[cfg(test)]
    pub fn export_table_sql(
        &self,
        table: &str,
        include_schema: bool,
        include_data: bool,
        filters: &[TableFilter],
        sort: Option<&TableSort>,
    ) -> Result<String, String> {
        self.export_table_sql_on(None, table, include_schema, include_data, filters, sort)
    }

    pub fn export_table_sql_on(
        &self,
        id: Option<&str>,
        table: &str,
        include_schema: bool,
        include_data: bool,
        filters: &[TableFilter],
        sort: Option<&TableSort>,
    ) -> Result<String, String> {
        if !include_schema && !include_data {
            return Err("include_schema or include_data required".into());
        }
        self.with_target(id, |conn, db| {
            assert_sql_allowed(&conn.permissions, "SELECT 1")?;
            let mysql_style = matches!(db, LiveDb::Mysql(_));
            let mut out = String::new();
            if include_schema {
                let ddl = match db {
                    LiveDb::Sqlite(c) => sqlite::create_sql(c, table)?,
                    LiveDb::Mysql(c) => block_on(mysql::create_sql(c, table))?,
                    LiveDb::Postgres(_) | LiveDb::Mssql(_) => {
                        let details = describe_table_inner(db, table)?;
                        synthesize_create(table, &details, false)?
                    }
                };
                out.push_str(ddl.trim_end_matches(';'));
                out.push_str(";\n\n");
            }
            if include_data {
                let data = fetch_all_inner(db, table, filters, sort)?;
                out.push_str(&rows_to_inserts(table, &data, mysql_style)?);
            }
            Ok(out)
        })
    }

    pub fn import_table_csv(
        &self,
        table: &str,
        csv: &str,
        mode: &str,
    ) -> Result<u64, String> {
        if csv.len() > IMPORT_BYTES_CAP {
            return Err("CSV exceeds 50MB limit".into());
        }
        let replace = match mode {
            "append" => false,
            "replace" => true,
            other => return Err(format!("unknown import mode: {other}")),
        };
        let (header, rows) = parse_csv(csv)?;
        self.with_mut(|conn, db| {
            if replace {
                assert_sql_allowed(&conn.permissions, &format!("DELETE FROM {table}"))?;
            }
            assert_sql_allowed(
                &conn.permissions,
                &format!("INSERT INTO {table} DEFAULT VALUES"),
            )?;

            let details = describe_table_inner(db, table)?;
            let known: Vec<&str> = details.columns.iter().map(|c| c.name.as_str()).collect();
            for h in &header {
                if !known.iter().any(|k| *k == h) {
                    return Err(format!("unknown column in CSV: {h}"));
                }
            }

            let mysql_style = matches!(db, LiveDb::Mysql(_));
            let q = if mysql_style {
                quote_ident_mysql
            } else {
                quote_ident
            };
            let safe = q(table)?;
            let cols = header
                .iter()
                .map(|c| q(c))
                .collect::<Result<Vec<_>, _>>()?
                .join(", ");

            if replace {
                run_sql_inner(db, &format!("DELETE FROM {safe}"))?;
            }

            let mut inserted = 0u64;
            for row in rows {
                if row.iter().all(|c| c.is_none()) {
                    continue;
                }
                let mut vals = Vec::with_capacity(header.len());
                for i in 0..header.len() {
                    match row.get(i).and_then(|c| c.as_ref()) {
                        None => vals.push("NULL".to_string()),
                        Some(s) => vals.push(format!("'{}'", s.replace('\'', "''"))),
                    }
                }
                // pad short rows
                while vals.len() < header.len() {
                    vals.push("NULL".into());
                }
                let sql = format!(
                    "INSERT INTO {safe} ({cols}) VALUES ({})",
                    vals.join(", ")
                );
                run_sql_inner(db, &sql)?;
                inserted += 1;
            }
            Ok(inserted)
        })
    }

    pub fn run_sql_script_on(&self, id: Option<&str>, sql: &str) -> Result<u64, String> {
        if sql.len() > IMPORT_BYTES_CAP {
            return Err("SQL script exceeds 50MB limit".into());
        }
        let stmts = split_sql_statements(sql);
        if stmts.is_empty() {
            return Err("SQL script is empty".into());
        }
        let mut ran = 0u64;
        for stmt in stmts {
            self.run_sql_on(id, &stmt)?;
            ran += 1;
        }
        Ok(ran)
    }

    fn fetch_all(
        &self,
        table: &str,
        filters: &[TableFilter],
        sort: Option<&TableSort>,
    ) -> Result<QueryResult, String> {
        self.with_mut(|conn, db| {
            assert_sql_allowed(&conn.permissions, "SELECT 1")?;
            fetch_all_inner(db, table, filters, sort)
        })
    }
}

fn describe_table_inner(db: &mut LiveDb, table: &str) -> Result<TableDetails, String> {
    match db {
        LiveDb::Sqlite(c) => sqlite::describe_table(c, table),
        LiveDb::Postgres(c) => block_on(postgres::describe_table(c, table)),
        LiveDb::Mysql(c) => block_on(mysql::describe_table(c, table)),
        LiveDb::Mssql(c) => block_on(mssql::describe_table(c, table)),
    }
}

fn preview_table_inner(
    db: &mut LiveDb,
    table: &str,
    limit: u32,
    offset: u32,
    filters: &[TableFilter],
    sort: Option<&TableSort>,
) -> Result<QueryResult, String> {
    match db {
        LiveDb::Sqlite(c) => sqlite::preview_table(c, table, limit, offset, filters, sort),
        LiveDb::Postgres(c) => {
            block_on(postgres::preview_table(c, table, limit, offset, filters, sort))
        }
        LiveDb::Mysql(c) => block_on(mysql::preview_table(c, table, limit, offset, filters, sort)),
        LiveDb::Mssql(c) => block_on(mssql::preview_table(c, table, limit, offset, filters, sort)),
    }
}

fn run_sql_inner(db: &mut LiveDb, sql: &str) -> Result<QueryResult, String> {
    match db {
        LiveDb::Sqlite(c) => sqlite::run_sql(c, sql),
        LiveDb::Postgres(c) => block_on(postgres::run_sql(c, sql)),
        LiveDb::Mysql(c) => block_on(mysql::run_sql(c, sql)),
        LiveDb::Mssql(c) => block_on(mssql::run_sql(c, sql)),
    }
}

fn fetch_all_inner(
    db: &mut LiveDb,
    table: &str,
    filters: &[TableFilter],
    sort: Option<&TableSort>,
) -> Result<QueryResult, String> {
    let mut offset = 0u32;
    let mut columns = Vec::new();
    let mut rows = Vec::new();
    loop {
        let page = preview_table_inner(db, table, EXPORT_CHUNK, offset, filters, sort)?;
        if columns.is_empty() {
            columns = page.columns;
        }
        let n = page.rows.len();
        rows.extend(page.rows);
        if rows.len() >= EXPORT_ROW_CAP {
            rows.truncate(EXPORT_ROW_CAP);
            break;
        }
        if n < EXPORT_CHUNK as usize {
            break;
        }
        offset += EXPORT_CHUNK;
    }
    Ok(QueryResult {
        columns,
        rows,
        rows_affected: None,
    })
}

fn open_engine(engine: &str, config: &ConnectionConfig) -> Result<LiveDb, String> {
    match engine {
        "sqlite" => Ok(LiveDb::Sqlite(sqlite::open(config)?)),
        "postgres" => Ok(LiveDb::Postgres(block_on(postgres::open(config))?)),
        "mysql" | "mariadb" => Ok(LiveDb::Mysql(block_on(mysql::open(config))?)),
        "mssql" => Ok(LiveDb::Mssql(block_on(mssql::connect(config))?)),
        other => Err(format!("unsupported engine: {other}")),
    }
}

pub fn test_engine(engine: &str, config: &ConnectionConfig) -> Result<String, String> {
    let (config, _tunnel) = maybe_tunnel(engine, config)?;
    let config = &config;
    match engine {
        "sqlite" => sqlite::test(config),
        "postgres" => block_on(postgres::test(config)),
        "mysql" | "mariadb" => block_on(mysql::test(config)),
        "mssql" => block_on(mssql::test(config)),
        other => Err(format!("unsupported engine: {other}")),
    }
}

fn block_on<T>(fut: impl std::future::Future<Output = T>) -> T {
    tauri::async_runtime::block_on(fut)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::permissions::Permissions;
    use crate::db::app_store::SavedConnection;

    fn fake_conn(engine: &str, config: ConnectionConfig, perms: Permissions) -> SavedConnection {
        SavedConnection {
            id: "test".into(),
            name: "test".into(),
            engine: engine.into(),
            category_id: None,
            category_name: None,
            is_favorite: false,
            accent_color: "#2563eb".into(),
            config,
            permissions: perms,
        }
    }

    #[test]
    fn sqlite_csv_sql_roundtrip_and_perm_deny() {
        let dir = std::env::temp_dir().join(format!("re-dbviewer-io-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.sqlite");
        {
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
                 INSERT INTO users VALUES (1, 'ada@example.com');",
            )
            .unwrap();
        }

        let session = SessionState::new();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions::default(),
            ))
            .unwrap();

        let csv = session.export_table_csv("users", &[], None).unwrap();
        assert!(csv.contains("email"));
        assert!(csv.contains("ada@example.com"));

        let ddl = session.export_table_sql("users", true, true, &[], None).unwrap();
        assert!(ddl.to_uppercase().contains("CREATE TABLE"));
        assert!(ddl.contains("INSERT INTO"));

        let n = session
            .import_table_csv(
                "users",
                "id,email\n2,grace@example.com\n",
                "append",
            )
            .unwrap();
        assert_eq!(n, 1);

        let preview = session.preview_table("users", 10, 0, &[], None).unwrap();
        assert_eq!(preview.rows.len(), 2);

        session.close().unwrap();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions {
                    allow_insert: false,
                    ..Permissions::default()
                },
            ))
            .unwrap();
        let err = session
            .import_table_csv("users", "id,email\n3,x@y.com\n", "append")
            .unwrap_err();
        assert!(err.to_lowercase().contains("insert"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn multi_session_active_and_scoped() {
        let dir = std::env::temp_dir().join(format!("re-dbviewer-multi-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mk = |name: &str, table: &str| {
            let path = dir.join(name);
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch(&format!("CREATE TABLE {table} (id INTEGER);")).unwrap();
            let mut sc = fake_conn("sqlite", ConnectionConfig::sqlite_path(path.to_string_lossy()), Permissions::default());
            sc.id = name.into();
            sc
        };
        let session = SessionState::new();
        session.open(mk("a.sqlite", "ta")).unwrap();
        session.open(mk("b.sqlite", "tb")).unwrap();
        assert_eq!(session.open_ids().len(), 2);
        // b opened last => active
        let names = |id: Option<&str>| -> Vec<String> {
            session.list_schema_on(id).unwrap().iter().flat_map(|s| s.children.iter().map(|c| c.name.clone()).chain(std::iter::once(s.name.clone()))).collect()
        };
        assert!(names(None).iter().any(|n| n == "tb"));
        assert!(names(Some("a.sqlite")).iter().any(|n| n == "ta"));
        session.set_active("a.sqlite").unwrap();
        assert!(names(None).iter().any(|n| n == "ta"));
        session.close_id(Some("a.sqlite")).unwrap();
        // active falls back to remaining
        assert!(names(None).iter().any(|n| n == "tb"));
        assert!(session.set_active("a.sqlite").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn mysql_export_import_smoke() {
        let session = SessionState::new();
        let opened = session.open(fake_conn(
            "mysql",
            ConnectionConfig {
                host: Some("127.0.0.1".into()),
                port: Some(3306),
                user: Some("root".into()),
                password: Some("redev".into()),
                database: Some("re_dbviewer".into()),
                ..Default::default()
            },
            Permissions::default(),
        ));
        if let Err(e) = opened {
            eprintln!("skip mysql smoke: {e}");
            return;
        }

        let csv = session.export_table_csv("users", &[], None).unwrap();
        assert!(csv.contains("email"));

        let sql = session.export_table_sql("users", true, true, &[], None).unwrap();
        assert!(sql.to_uppercase().contains("CREATE TABLE"));
        assert!(sql.contains("INSERT INTO"));

        // append a disposable row then replace back? keep seed intact: append unique email
        let n = session
            .import_table_csv(
                "users",
                "email,name\nio_smoke@example.com,IO Smoke\n",
                "append",
            )
            .unwrap();
        assert_eq!(n, 1);

        session
            .run_sql_script_on(None, "DELETE FROM users WHERE email = 'io_smoke@example.com'")
            .unwrap();

        session
            .open(fake_conn(
                "mysql",
                ConnectionConfig {
                    host: Some("127.0.0.1".into()),
                    port: Some(3306),
                    user: Some("root".into()),
                    password: Some("redev".into()),
                    database: Some("re_dbviewer".into()),
                    ..Default::default()
                },
                Permissions {
                    allow_insert: false,
                    ..Permissions::default()
                },
            ))
            .unwrap();
        // re-open overwrites — need close first? open replaces
        let err = session
            .import_table_csv(
                "users",
                "email,name\nblocked@example.com,Nope\n",
                "append",
            )
            .unwrap_err();
        assert!(err.to_lowercase().contains("insert"));
    }
}
