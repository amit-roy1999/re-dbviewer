use tiberius::{AuthMethod, Client, Config, EncryptionLevel, Row};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

use super::super::config::ConnectionConfig;
use super::super::types::{
    build_filter_sort, is_result_query, quote_ident, split_table, ColumnInfo, ForeignKeyInfo,
    IndexInfo, PlaceholderStyle, QueryResult, SchemaNode, TableDetails, TableFilter, TableSort,
};

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
    filters: &[TableFilter],
    sort: Option<&TableSort>,
) -> Result<QueryResult, String> {
    let safe = quote_ident(table)?;
    let (where_sql, order_sql, _binds) =
        build_filter_sort(filters, sort, quote_ident, PlaceholderStyle::Inline)?;
    let order = if order_sql.is_empty() {
        " ORDER BY (SELECT NULL)".to_string()
    } else {
        order_sql
    };
    let sql = format!(
        "SELECT * FROM {safe}{where_sql}{order} OFFSET {offset} ROWS FETCH NEXT {limit} ROWS ONLY"
    );
    run_query(client, &sql).await
}

pub async fn describe_table(
    client: &mut MssqlClient,
    table: &str,
) -> Result<TableDetails, String> {
    let (schema_opt, name) = split_table(table);
    let schema = schema_opt.unwrap_or("dbo");
    let schema_lit = schema.replace('\'', "''");
    let name_lit = name.replace('\'', "''");

    let sql = format!(
        "SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT,
                CASE WHEN pk.COLUMN_NAME IS NULL THEN 0 ELSE 1 END AS is_pk
         FROM INFORMATION_SCHEMA.COLUMNS c
         LEFT JOIN (
           SELECT kcu.COLUMN_NAME
           FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
           JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
             ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
           WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
             AND tc.TABLE_SCHEMA = '{schema_lit}' AND tc.TABLE_NAME = '{name_lit}'
         ) pk ON pk.COLUMN_NAME = c.COLUMN_NAME
         WHERE c.TABLE_SCHEMA = '{schema_lit}' AND c.TABLE_NAME = '{name_lit}'
         ORDER BY c.ORDINAL_POSITION"
    );
    let stream = client.simple_query(sql).await.map_err(|e| e.to_string())?;
    let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
    let columns = rows
        .iter()
        .map(|r| ColumnInfo {
            name: r.get::<&str, _>(0).unwrap_or("").to_string(),
            data_type: r.get::<&str, _>(1).unwrap_or("").to_string(),
            nullable: r
                .get::<&str, _>(2)
                .unwrap_or("YES")
                .eq_ignore_ascii_case("YES"),
            default_value: r.get::<&str, _>(3).map(|s| s.to_string()),
            is_pk: r.get::<i32, _>(4).unwrap_or(0) != 0,
        })
        .collect();

    let fk_sql = format!(
        "SELECT fk.name, c1.name, t2.name, c2.name
         FROM sys.foreign_keys fk
         JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
         JOIN sys.tables t1 ON fkc.parent_object_id = t1.object_id
         JOIN sys.schemas s1 ON t1.schema_id = s1.schema_id
         JOIN sys.columns c1 ON fkc.parent_object_id = c1.object_id AND fkc.parent_column_id = c1.column_id
         JOIN sys.tables t2 ON fkc.referenced_object_id = t2.object_id
         JOIN sys.columns c2 ON fkc.referenced_object_id = c2.object_id AND fkc.referenced_column_id = c2.column_id
         WHERE s1.name = '{schema_lit}' AND t1.name = '{name_lit}'
         ORDER BY fk.name"
    );
    let stream = client
        .simple_query(fk_sql)
        .await
        .map_err(|e| e.to_string())?;
    let fk_rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
    let mut foreign_keys: Vec<ForeignKeyInfo> = Vec::new();
    for r in fk_rows {
        let cname = r.get::<&str, _>(0).unwrap_or("").to_string();
        let col = r.get::<&str, _>(1).unwrap_or("").to_string();
        let ref_t = r.get::<&str, _>(2).unwrap_or("").to_string();
        let ref_c = r.get::<&str, _>(3).unwrap_or("").to_string();
        if let Some(fk) = foreign_keys.iter_mut().find(|f| f.name == cname) {
            fk.columns.push(col);
            fk.ref_columns.push(ref_c);
        } else {
            foreign_keys.push(ForeignKeyInfo {
                name: cname,
                columns: vec![col],
                ref_table: ref_t,
                ref_columns: vec![ref_c],
            });
        }
    }

    let idx_sql = format!(
        "SELECT i.name, i.is_unique, c.name
         FROM sys.indexes i
         JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
         JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
         JOIN sys.tables t ON i.object_id = t.object_id
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         WHERE s.name = '{schema_lit}' AND t.name = '{name_lit}' AND i.name IS NOT NULL
         ORDER BY i.name, ic.key_ordinal"
    );
    let stream = client
        .simple_query(idx_sql)
        .await
        .map_err(|e| e.to_string())?;
    let idx_rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
    let mut indexes: Vec<IndexInfo> = Vec::new();
    for r in idx_rows {
        let iname = r.get::<&str, _>(0).unwrap_or("").to_string();
        let unique = r.get::<bool, _>(1).unwrap_or(false);
        let col = r.get::<&str, _>(2).unwrap_or("").to_string();
        if let Some(ix) = indexes.iter_mut().find(|i| i.name == iname) {
            ix.columns.push(col);
        } else {
            indexes.push(IndexInfo {
                name: iname,
                unique,
                columns: vec![col],
            });
        }
    }

    Ok(TableDetails {
        columns,
        foreign_keys,
        indexes,
    })
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
