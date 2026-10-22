use tokio_postgres::{NoTls, Row};

use super::super::config::ConnectionConfig;
use super::super::types::{
    build_filter_sort, is_result_query, quote_ident, split_table, CheckConstraintInfo, ColumnInfo,
    ForeignKeyInfo, IndexInfo, PlaceholderStyle, QueryResult, SchemaNode, TableDetails,
    TableFilter, TableSort,
};

fn conn_str(config: &ConnectionConfig) -> String {
    let host = config.socket().unwrap_or_else(|| config.host_or("127.0.0.1"));
    let port = config.port.unwrap_or(5432);
    let user = config.user_or("postgres");
    let password = config.password_or();
    let db = config.database_or("postgres");
    format!("host={host} port={port} user={user} password={password} dbname={db}")
}

fn tls_connector(config: &ConnectionConfig) -> Result<postgres_native_tls::MakeTlsConnector, String> {
    let mode = config.ssl_mode.as_deref().unwrap_or("").to_ascii_lowercase();
    let verify = mode.starts_with("verify");
    let mut b = native_tls::TlsConnector::builder();
    if let Some(ca) = config.ssl_ca_path() {
        let pem = std::fs::read(ca).map_err(|e| format!("ssl CA {ca}: {e}"))?;
        b.add_root_certificate(native_tls::Certificate::from_pem(&pem).map_err(|e| e.to_string())?);
    }
    if let (Some(cert), Some(key)) = (config.ssl_cert_path(), config.ssl_key_path()) {
        let c = std::fs::read(cert).map_err(|e| format!("ssl cert {cert}: {e}"))?;
        let k = std::fs::read(key).map_err(|e| format!("ssl key {key}: {e}"))?;
        b.identity(native_tls::Identity::from_pkcs8(&c, &k).map_err(|e| e.to_string())?);
    }
    if !verify {
        b.danger_accept_invalid_certs(true);
        b.danger_accept_invalid_hostnames(true);
    } else if mode == "verify-ca" {
        b.danger_accept_invalid_hostnames(true);
    }
    Ok(postgres_native_tls::MakeTlsConnector::new(
        b.build().map_err(|e| e.to_string())?,
    ))
}

async fn connect(config: &ConnectionConfig) -> Result<tokio_postgres::Client, String> {
    let s = conn_str(config);
    if config.ssl_enabled() && config.socket().is_none() {
        let (client, connection) = tokio_postgres::connect(&format!("{s} sslmode=require"), tls_connector(config)?)
            .await
            .map_err(|e| e.to_string())?;
        tokio::spawn(async move {
            let _ = connection.await;
        });
        Ok(client)
    } else {
        let (client, connection) = tokio_postgres::connect(&s, NoTls)
            .await
            .map_err(|e| e.to_string())?;
        tokio::spawn(async move {
            let _ = connection.await;
        });
        Ok(client)
    }
}

pub async fn test(config: &ConnectionConfig) -> Result<String, String> {
    let client = connect(config).await?;
    let row = client
        .query_one("SELECT version()", &[])
        .await
        .map_err(|e| e.to_string())?;
    let v: String = row.get(0);
    Ok(format!("ok ({v})"))
}

pub async fn open(config: &ConnectionConfig) -> Result<tokio_postgres::Client, String> {
    connect(config).await
}

pub async fn list_schema(client: &tokio_postgres::Client) -> Result<Vec<SchemaNode>, String> {
    // Include tables, views, materialized views, and sequences (relkind r/p/v/m/S).
    let rows = client
        .query(
            "SELECT n.nspname, c.relname,
                    CASE c.relkind
                      WHEN 'r' THEN 'table'
                      WHEN 'p' THEN 'table'
                      WHEN 'v' THEN 'view'
                      WHEN 'm' THEN 'matview'
                      WHEN 'S' THEN 'sequence'
                      ELSE 'other'
                    END AS kind
             FROM pg_catalog.pg_class c
             JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S')
               AND n.nspname NOT IN ('pg_catalog', 'information_schema')
               AND n.nspname NOT LIKE 'pg_toast%'
               AND n.nspname NOT LIKE 'pg_temp_%'
             ORDER BY n.nspname, c.relname",
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut schemas: Vec<SchemaNode> = Vec::new();
    for row in rows {
        let schema: String = row.get(0);
        let name: String = row.get(1);
        let kind: String = row.get(2);
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
    filters: &[TableFilter],
    sort: Option<&TableSort>,
) -> Result<QueryResult, String> {
    let safe = quote_ident(table)?;
    let (where_sql, order_sql, binds) =
        build_filter_sort(filters, sort, quote_ident, PlaceholderStyle::Dollar)?;
    let n = binds.len();
    let sql = format!(
        "SELECT * FROM {safe}{where_sql}{order_sql} LIMIT ${} OFFSET ${}",
        n + 1,
        n + 2
    );
    let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = Vec::new();
    for b in &binds {
        params.push(b);
    }
    let lim = limit as i64;
    let off = offset as i64;
    params.push(&lim);
    params.push(&off);
    run_query_params(client, &sql, &params).await
}

pub async fn describe_table(
    client: &tokio_postgres::Client,
    table: &str,
) -> Result<TableDetails, String> {
    let (schema_opt, name) = split_table(table);
    let schema = schema_opt.unwrap_or("public");

    let col_rows = client
        .query(
            "SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
                    EXISTS (
                      SELECT 1 FROM information_schema.table_constraints tc
                      JOIN information_schema.key_column_usage kcu
                        ON tc.constraint_name = kcu.constraint_name
                       AND tc.table_schema = kcu.table_schema
                      WHERE tc.constraint_type = 'PRIMARY KEY'
                        AND tc.table_schema = c.table_schema
                        AND tc.table_name = c.table_name
                        AND kcu.column_name = c.column_name
                    ) AS is_pk,
                    CASE WHEN c.is_generated = 'ALWAYS' THEN c.generation_expression ELSE NULL END
             FROM information_schema.columns c
             WHERE c.table_schema = $1 AND c.table_name = $2
             ORDER BY c.ordinal_position",
            &[&schema, &name],
        )
        .await
        .map_err(|e| e.to_string())?;

    let columns = col_rows
        .iter()
        .map(|r| ColumnInfo {
            name: r.get(0),
            data_type: r.get(1),
            nullable: r.get::<_, String>(2).eq_ignore_ascii_case("YES"),
            default_value: r.get(3),
            is_pk: r.get(4),
            generated: r.get(5),
        })
        .collect();

    let fk_rows = client
        .query(
            "SELECT tc.constraint_name, kcu.column_name, ccu.table_name, ccu.column_name
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
             JOIN information_schema.constraint_column_usage ccu
               ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
             WHERE tc.constraint_type = 'FOREIGN KEY'
               AND tc.table_schema = $1 AND tc.table_name = $2
             ORDER BY tc.constraint_name, kcu.ordinal_position",
            &[&schema, &name],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut foreign_keys: Vec<ForeignKeyInfo> = Vec::new();
    for r in fk_rows {
        let cname: String = r.get(0);
        let col: String = r.get(1);
        let ref_t: String = r.get(2);
        let ref_c: String = r.get(3);
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

    let idx_rows = client
        .query(
            "SELECT i.relname, ix.indisunique, a.attname
             FROM pg_class t
             JOIN pg_index ix ON t.oid = ix.indrelid
             JOIN pg_class i ON i.oid = ix.indexrelid
             JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
             JOIN pg_namespace n ON n.oid = t.relnamespace
             WHERE n.nspname = $1 AND t.relname = $2
             ORDER BY i.relname, a.attnum",
            &[&schema, &name],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut indexes: Vec<IndexInfo> = Vec::new();
    for r in idx_rows {
        let iname: String = r.get(0);
        let unique: bool = r.get(1);
        let col: String = r.get(2);
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

    let check_rows = client
        .query(
            "SELECT con.conname, pg_get_constraintdef(con.oid)
             FROM pg_constraint con
             JOIN pg_class rel ON rel.oid = con.conrelid
             JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
             WHERE con.contype = 'c'
               AND nsp.nspname = $1 AND rel.relname = $2
             ORDER BY con.conname",
            &[&schema, &name],
        )
        .await
        .map_err(|e| e.to_string())?;
    let check_constraints = check_rows
        .iter()
        .map(|r| CheckConstraintInfo {
            name: r.get(0),
            definition: r.get(1),
        })
        .collect();

    Ok(TableDetails {
        columns,
        foreign_keys,
        indexes,
        check_constraints,
    })
}

async fn run_query_params(
    client: &tokio_postgres::Client,
    sql: &str,
    params: &[&(dyn tokio_postgres::types::ToSql + Sync)],
) -> Result<QueryResult, String> {
    let rows = client
        .query(sql, params)
        .await
        .map_err(|e| e.to_string())?;
    if rows.is_empty() {
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
    // json / jsonb (e.g. EXPLAIN FORMAT JSON) — not readable as String
    if let Ok(v) = row.try_get::<_, Option<serde_json::Value>>(i) {
        return match v {
            None => serde_json::Value::Null,
            Some(j) => j,
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
