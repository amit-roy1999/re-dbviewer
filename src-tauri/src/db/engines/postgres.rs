use tokio_postgres::{NoTls, Row};

use super::super::config::ConnectionConfig;
use super::super::types::{is_result_query, quote_ident, QueryResult, SchemaNode};

fn conn_str(config: &ConnectionConfig) -> String {
    let host = config.host_or("127.0.0.1");
    let port = config.port.unwrap_or(5432);
    let user = config.user_or("postgres");
    let password = config.password_or();
    let db = config.database_or("postgres");
    format!("host={host} port={port} user={user} password={password} dbname={db}")
}

pub async fn test(config: &ConnectionConfig) -> Result<String, String> {
    let (client, connection) = tokio_postgres::connect(&conn_str(config), NoTls)
        .await
        .map_err(|e| e.to_string())?;
    tokio::spawn(async move {
        let _ = connection.await;
    });
    let row = client
        .query_one("SELECT version()", &[])
        .await
        .map_err(|e| e.to_string())?;
    let v: String = row.get(0);
    Ok(format!("ok ({v})"))
}

pub async fn open(config: &ConnectionConfig) -> Result<tokio_postgres::Client, String> {
    let (client, connection) = tokio_postgres::connect(&conn_str(config), NoTls)
        .await
        .map_err(|e| e.to_string())?;
    tokio::spawn(async move {
        let _ = connection.await;
    });
    Ok(client)
}

pub async fn list_schema(client: &tokio_postgres::Client) -> Result<Vec<SchemaNode>, String> {
    let rows = client
        .query(
            "SELECT table_schema, table_name, table_type
             FROM information_schema.tables
             WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
             ORDER BY table_schema, table_name",
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut schemas: Vec<SchemaNode> = Vec::new();
    for row in rows {
        let schema: String = row.get(0);
        let name: String = row.get(1);
        let ttype: String = row.get(2);
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
    client: &tokio_postgres::Client,
    table: &str,
    limit: u32,
    offset: u32,
) -> Result<QueryResult, String> {
    let safe = quote_ident(table)?;
    let sql = format!("SELECT * FROM {safe} LIMIT {limit} OFFSET {offset}");
    run_query(client, &sql).await
}

pub async fn run_sql(
    client: &tokio_postgres::Client,
    sql: &str,
) -> Result<QueryResult, String> {
    if is_result_query(sql) {
        run_query(client, sql).await
    } else {
        let n = client
            .execute(sql, &[])
            .await
            .map_err(|e| e.to_string())?;
        Ok(QueryResult {
            columns: vec!["rows_affected".into()],
            rows: vec![vec![serde_json::json!(n)]],
            rows_affected: Some(n),
        })
    }
}

async fn run_query(client: &tokio_postgres::Client, sql: &str) -> Result<QueryResult, String> {
    let rows = client.query(sql, &[]).await.map_err(|e| e.to_string())?;
    if rows.is_empty() {
        // still need columns — describe via prepare
        let stmt = client.prepare(sql).await.map_err(|e| e.to_string())?;
        let columns = stmt
            .columns()
            .iter()
            .map(|c| c.name().to_string())
            .collect();
        return Ok(QueryResult {
            columns,
            rows: vec![],
            rows_affected: None,
        });
    }
    let columns: Vec<String> = rows[0]
        .columns()
        .iter()
        .map(|c| c.name().to_string())
        .collect();
    let data = rows.iter().map(row_to_json).collect();
    Ok(QueryResult {
        columns,
        rows: data,
        rows_affected: None,
    })
}

fn row_to_json(row: &Row) -> Vec<serde_json::Value> {
    let mut vals = Vec::with_capacity(row.len());
    for i in 0..row.len() {
        vals.push(pg_value(row, i));
    }
    vals
}

fn pg_value(row: &Row, i: usize) -> serde_json::Value {
    if let Ok(v) = row.try_get::<_, Option<bool>>(i) {
        return match v {
            None => serde_json::Value::Null,
            Some(b) => serde_json::json!(b),
        };
    }
    if let Ok(v) = row.try_get::<_, Option<i64>>(i) {
        return match v {
            None => serde_json::Value::Null,
            Some(n) => serde_json::json!(n),
        };
    }
    if let Ok(v) = row.try_get::<_, Option<f64>>(i) {
        return match v {
            None => serde_json::Value::Null,
            Some(n) => serde_json::json!(n),
        };
    }
    if let Ok(v) = row.try_get::<_, Option<String>>(i) {
        return match v {
            None => serde_json::Value::Null,
            Some(s) => serde_json::Value::String(s),
        };
    }
    if let Ok(v) = row.try_get::<_, Option<Vec<u8>>>(i) {
        return match v {
            None => serde_json::Value::Null,
            Some(b) => serde_json::Value::String(format!("<blob {} bytes>", b.len())),
        };
    }
    serde_json::Value::Null
}
