use std::sync::Mutex;

use super::app_store::SavedConnection;
use super::config::ConnectionConfig;
use super::engines::{mssql, mysql, postgres, sqlite};
use super::permissions::assert_sql_allowed;
use super::types::{QueryResult, SchemaNode};

enum LiveDb {
    Sqlite(rusqlite::Connection),
    Postgres(tokio_postgres::Client),
    Mysql(mysql_async::Conn),
    Mssql(mssql::MssqlClient),
}

struct OpenSession {
    connection: SavedConnection,
    db: LiveDb,
}

pub struct SessionState {
    inner: Mutex<Option<OpenSession>>,
}

impl SessionState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    pub fn open(&self, connection: SavedConnection) -> Result<(), String> {
        let db = open_engine(&connection.engine, &connection.config)?;
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        *guard = Some(OpenSession { connection, db });
        Ok(())
    }

    pub fn close(&self) -> Result<(), String> {
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        *guard = None;
        Ok(())
    }

    fn with_mut<T>(
        &self,
        f: impl FnOnce(&SavedConnection, &mut LiveDb) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        let session = guard
            .as_mut()
            .ok_or_else(|| "no connection open".to_string())?;
        f(&session.connection, &mut session.db)
    }

    pub fn list_schema(&self) -> Result<Vec<SchemaNode>, String> {
        self.with_mut(|_, db| match db {
            LiveDb::Sqlite(c) => sqlite::list_schema(c),
            LiveDb::Postgres(c) => block_on(postgres::list_schema(c)),
            LiveDb::Mysql(c) => block_on(mysql::list_schema(c)),
            LiveDb::Mssql(c) => block_on(mssql::list_schema(c)),
        })
    }

    pub fn preview_table(
        &self,
        table: &str,
        limit: u32,
        offset: u32,
    ) -> Result<QueryResult, String> {
        self.with_mut(|conn, db| {
            assert_sql_allowed(&conn.permissions, "SELECT 1")?;
            match db {
                LiveDb::Sqlite(c) => sqlite::preview_table(c, table, limit, offset),
                LiveDb::Postgres(c) => block_on(postgres::preview_table(c, table, limit, offset)),
                LiveDb::Mysql(c) => block_on(mysql::preview_table(c, table, limit, offset)),
                LiveDb::Mssql(c) => block_on(mssql::preview_table(c, table, limit, offset)),
            }
        })
    }

    pub fn run_sql(&self, sql: &str) -> Result<QueryResult, String> {
        let trimmed = sql.trim();
        if trimmed.is_empty() {
            return Err("empty SQL".into());
        }
        self.with_mut(|conn, db| {
            assert_sql_allowed(&conn.permissions, trimmed)?;
            match db {
                LiveDb::Sqlite(c) => sqlite::run_sql(c, trimmed),
                LiveDb::Postgres(c) => block_on(postgres::run_sql(c, trimmed)),
                LiveDb::Mysql(c) => block_on(mysql::run_sql(c, trimmed)),
                LiveDb::Mssql(c) => block_on(mssql::run_sql(c, trimmed)),
            }
        })
    }
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
