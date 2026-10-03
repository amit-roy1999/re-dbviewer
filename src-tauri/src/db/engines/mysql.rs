use mysql_async::prelude::*;
use mysql_async::{OptsBuilder, Row, Value};

use super::super::config::ConnectionConfig;
use super::super::types::{is_result_query, QueryResult, SchemaNode};

fn opts(config: &ConnectionConfig) -> OptsBuilder {
    OptsBuilder::default()
        .ip_or_hostname(config.host_or("127.0.0.1"))
        .tcp_port(config.port.unwrap_or(3306))
        .user(Some(config.user_or("root")))
        .pass(Some(config.password_or()))
        .db_name(Some(config.database_or("mysql")))
}

pub async fn test(config: &ConnectionConfig) -> Result<String, String> {
    let pool = mysql_async::Pool::new(opts(config));
    let mut conn = pool.get_conn().await.map_err(|e| e.to_string())?;
    let v: Option<String> = conn
        .query_first("SELECT VERSION()")
        .await
        .map_err(|e| e.to_string())?;
    drop(conn);
    pool.disconnect().await.map_err(|e| e.to_string())?;
    Ok(format!("ok (mysql {})", v.unwrap_or_default()))
}

pub async fn open(config: &ConnectionConfig) -> Result<mysql_async::Conn, String> {
    let pool = mysql_async::Pool::new(opts(config));
    pool.get_conn().await.map_err(|e| e.to_string())
}

pub async fn list_schema(conn: &mut mysql_async::Conn) -> Result<Vec<SchemaNode>, String> {
    let rows: Vec<(String, String, String)> = conn
        .query(
            "SELECT table_schema, table_name, table_type
             FROM information_schema.tables
             WHERE table_schema NOT IN ('mysql','information_schema','performance_schema','sys')
             ORDER BY table_schema, table_name",
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut schemas: Vec<SchemaNode> = Vec::new();
    for (schema, name, ttype) in rows {
        let kind = if ttype.contains("VIEW") {
            "view"
        } else {
            "table"
        }
        .to_string();
        if let Some(s) = schemas.iter_mut().find(|s| s.name == schema) {
            s.children.push(SchemaNode {
                name,
                kind,
                children: vec![],
            });
        } else {
            schemas.push(SchemaNode {
                name: schema,
                kind: "schema".into(),
                children: vec![SchemaNode {
                    name,
                    kind,
                    children: vec![],
                }],
            });
        }
    }
    Ok(schemas)
}

pub async fn preview_table(
    conn: &mut mysql_async::Conn,
    table: &str,
    limit: u32,
    offset: u32,
) -> Result<QueryResult, String> {
    let safe = quote_ident_mysql(table)?;
    let sql = format!("SELECT * FROM {safe} LIMIT {limit} OFFSET {offset}");
    run_query(conn, &sql).await
}

pub async fn run_sql(conn: &mut mysql_async::Conn, sql: &str) -> Result<QueryResult, String> {
    if is_result_query(sql) {
        run_query(conn, sql).await
    } else {
        let result = conn.query_iter(sql).await.map_err(|e| e.to_string())?;
        let n = result.affected_rows();
        Ok(QueryResult {
            columns: vec!["rows_affected".into()],
            rows: vec![vec![serde_json::json!(n)]],
            rows_affected: Some(n),
        })
    }
}

async fn run_query(conn: &mut mysql_async::Conn, sql: &str) -> Result<QueryResult, String> {
    let mut result = conn.query_iter(sql).await.map_err(|e| e.to_string())?;
    let columns: Vec<String> = result
        .columns_ref()
        .iter()
        .map(|c| String::from_utf8_lossy(c.name_ref()).into_owned())
        .collect();
    let mut rows = Vec::new();
    while let Some(row) = result.next().await.map_err(|e| e.to_string())? {
        rows.push(mysql_row_to_json(&row, columns.len()));
    }
    Ok(QueryResult {
        columns,
        rows,
        rows_affected: None,
    })
}

fn mysql_row_to_json(row: &Row, ncols: usize) -> Vec<serde_json::Value> {
    (0..ncols)
        .map(|i| match row.as_ref(i).unwrap_or(&Value::NULL) {
            Value::NULL => serde_json::Value::Null,
            Value::Bytes(b) => serde_json::Value::String(String::from_utf8_lossy(b).into_owned()),
            Value::Int(n) => serde_json::json!(n),
            Value::UInt(n) => serde_json::json!(n),
            Value::Float(n) => serde_json::json!(n),
            Value::Double(n) => serde_json::json!(n),
            other => serde_json::Value::String(format!("{other:?}")),
        })
        .collect()
}

fn quote_ident_mysql(name: &str) -> Result<String, String> {
    if name.is_empty() || name.contains('`') || name.contains('\0') {
        return Err("invalid identifier".into());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
    {
        return Err("invalid identifier".into());
    }
    if name.contains('.') {
        return Ok(name
            .split('.')
            .map(|p| format!("`{p}`"))
            .collect::<Vec<_>>()
            .join("."));
    }
    Ok(format!("`{name}`"))
}
