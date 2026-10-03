use tokio_postgres::{NoTls, Row};

use super::super::config::ConnectionConfig;
use super::super::types::{
    build_filter_sort, is_result_query, quote_ident, split_table, ColumnInfo, ForeignKeyInfo,
    IndexInfo, PlaceholderStyle, QueryResult, SchemaNode, TableDetails, TableFilter, TableSort,
};

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
                    ) AS is_pk
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

    Ok(TableDetails {
        columns,
        foreign_keys,
        indexes,
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
    if let Ok(v) = row.try_get::<_, Option<Vec<u8>>>(i) {
        return match v {
            None => serde_json::Value::Null,
            Some(b) => serde_json::Value::String(format!("<blob {} bytes>", b.len())),
        };
    }
    serde_json::Value::Null
}
