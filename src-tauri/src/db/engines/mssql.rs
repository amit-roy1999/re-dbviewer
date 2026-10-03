use tiberius::{AuthMethod, Client, Config, EncryptionLevel, Row};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

use super::super::config::ConnectionConfig;
use super::super::types::{is_result_query, quote_ident, QueryResult, SchemaNode};

fn make_config(config: &ConnectionConfig) -> Config {
    let mut cfg = Config::new();
    cfg.host(config.host_or("127.0.0.1"));
    cfg.port(config.port.unwrap_or(1433));
    cfg.authentication(AuthMethod::sql_server(
        config.user_or("sa"),
        config.password_or(),
    ));
    let db = config.database_or("master");
    cfg.database(db);
    // ponytail: trust cert for local/dev; tighten with sslMode later
    cfg.encryption(EncryptionLevel::NotSupported);
    cfg.trust_cert();
    cfg
}

pub type MssqlClient = Client<Compat<TcpStream>>;

pub async fn connect(config: &ConnectionConfig) -> Result<MssqlClient, String> {
    let cfg = make_config(config);
    let tcp = TcpStream::connect(cfg.get_addr())
        .await
        .map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    Client::connect(cfg, tcp.compat_write())
        .await
        .map_err(|e| e.to_string())
}

pub async fn test(config: &ConnectionConfig) -> Result<String, String> {
    let mut client = connect(config).await?;
    let stream = client
        .simple_query("SELECT @@VERSION AS v")
        .await
        .map_err(|e| e.to_string())?;
    let rows: Vec<Row> = stream.into_first_result().await.map_err(|e| e.to_string())?;
    let v = rows
        .first()
        .and_then(|r| r.get::<&str, _>(0))
        .unwrap_or("sql server")
        .to_string();
    Ok(format!("ok ({v})"))
}

pub async fn list_schema(client: &mut MssqlClient) -> Result<Vec<SchemaNode>, String> {
    let stream = client
        .simple_query(
            "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
             FROM INFORMATION_SCHEMA.TABLES
             ORDER BY TABLE_SCHEMA, TABLE_NAME",
        )
        .await
        .map_err(|e| e.to_string())?;
    let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;

    let mut schemas: Vec<SchemaNode> = Vec::new();
    for row in rows {
        let schema: &str = row.get(0).unwrap_or("dbo");
        let name: &str = row.get(1).unwrap_or("");
        let ttype: &str = row.get(2).unwrap_or("BASE TABLE");
        let kind = if ttype.contains("VIEW") {
            "view"
        } else {
            "table"
        }
        .to_string();
        let schema = schema.to_string();
        let name = name.to_string();
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
    client: &mut MssqlClient,
    table: &str,
    limit: u32,
    offset: u32,
) -> Result<QueryResult, String> {
    let safe = quote_ident(table)?;
    let sql = format!(
        "SELECT * FROM {safe} ORDER BY (SELECT NULL) OFFSET {offset} ROWS FETCH NEXT {limit} ROWS ONLY"
    );
    run_query(client, &sql).await
}

pub async fn run_sql(client: &mut MssqlClient, sql: &str) -> Result<QueryResult, String> {
    if is_result_query(sql) {
        run_query(client, sql).await
    } else {
        let result = client
            .execute(sql, &[])
            .await
            .map_err(|e| e.to_string())?;
        let n = result.rows_affected().first().copied().unwrap_or(0);
        Ok(QueryResult {
            columns: vec!["rows_affected".into()],
            rows: vec![vec![serde_json::json!(n)]],
            rows_affected: Some(n),
        })
    }
}

async fn run_query(client: &mut MssqlClient, sql: &str) -> Result<QueryResult, String> {
    let stream = client.simple_query(sql).await.map_err(|e| e.to_string())?;
    let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
    if rows.is_empty() {
        return Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            rows_affected: None,
        });
    }
    let col_count = rows[0].columns().len();
    let columns: Vec<String> = rows[0]
        .columns()
        .iter()
        .map(|c| c.name().to_string())
        .collect();
    let data = rows
        .iter()
        .map(|r| mssql_row_to_json(r, col_count))
        .collect();
    Ok(QueryResult {
        columns,
        rows: data,
        rows_affected: None,
    })
}

fn mssql_row_to_json(row: &Row, ncols: usize) -> Vec<serde_json::Value> {
    (0..ncols)
        .map(|i| {
            if let Some(v) = row.get::<&str, _>(i) {
                return serde_json::Value::String(v.to_string());
            }
            if let Some(v) = row.get::<i64, _>(i) {
                return serde_json::json!(v);
            }
            if let Some(v) = row.get::<i32, _>(i) {
                return serde_json::json!(v);
            }
            if let Some(v) = row.get::<f64, _>(i) {
                return serde_json::json!(v);
            }
            if let Some(v) = row.get::<bool, _>(i) {
                return serde_json::json!(v);
            }
            serde_json::Value::Null
        })
        .collect()
}
