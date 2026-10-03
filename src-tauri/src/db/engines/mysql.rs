use mysql_async::prelude::*;
use mysql_async::{Params, Row, Value};

use super::super::config::ConnectionConfig;
use super::super::types::{
    build_filter_sort, is_result_query, quote_ident_mysql, split_table, ColumnInfo, ForeignKeyInfo,
    IndexInfo, PlaceholderStyle, QueryResult, SchemaNode, TableDetails, TableFilter, TableSort,
};

fn opts(config: &ConnectionConfig) -> mysql_async::OptsBuilder {
    mysql_async::OptsBuilder::default()
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

pub async fn describe_table(
    conn: &mut mysql_async::Conn,
    table: &str,
) -> Result<TableDetails, String> {
    let (schema_opt, name) = split_table(table);
    let schema: String = if let Some(s) = schema_opt {
        s.to_string()
    } else {
        let db: Option<String> = conn
            .exec_first("SELECT DATABASE()", ())
            .await
            .map_err(|e| e.to_string())?;
        db.unwrap_or_else(|| "re_dbviewer".into())
    };

    let col_rows: Vec<(String, String, String, Option<String>, String)> = conn
        .exec(
            "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
             ORDER BY ORDINAL_POSITION",
            (schema.as_str(), name),
        )
        .await
        .map_err(|e| e.to_string())?;

    let columns = col_rows
        .into_iter()
        .map(|(n, t, nullable, def, key)| ColumnInfo {
            name: n,
            data_type: t,
            nullable: nullable.eq_ignore_ascii_case("YES"),
            default_value: def,
            is_pk: key == "PRI",
        })
        .collect();

    let fk_rows: Vec<(String, String, String, String)> = conn
        .exec(
            "SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
             ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION",
            (schema.as_str(), name),
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut foreign_keys: Vec<ForeignKeyInfo> = Vec::new();
    for (cname, col, ref_t, ref_c) in fk_rows {
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

    let idx_rows: Vec<(String, i64, String)> = conn
        .exec(
            "SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
             FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
             ORDER BY INDEX_NAME, SEQ_IN_INDEX",
            (schema.as_str(), name),
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut indexes: Vec<IndexInfo> = Vec::new();
    for (iname, non_unique, col) in idx_rows {
        if let Some(ix) = indexes.iter_mut().find(|i| i.name == iname) {
            ix.columns.push(col);
        } else {
            indexes.push(IndexInfo {
                name: iname,
                unique: non_unique == 0,
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

pub async fn preview_table(
    conn: &mut mysql_async::Conn,
    table: &str,
    limit: u32,
    offset: u32,
    filters: &[TableFilter],
    sort: Option<&TableSort>,
) -> Result<QueryResult, String> {
    let safe = quote_ident_mysql(table)?;
    let (where_sql, order_sql, binds) =
        build_filter_sort(filters, sort, quote_ident_mysql, PlaceholderStyle::Question)?;
    let sql = format!("SELECT * FROM {safe}{where_sql}{order_sql} LIMIT ? OFFSET ?");
    let mut params: Vec<Value> = binds.into_iter().map(Value::from).collect();
    params.push(Value::from(limit));
    params.push(Value::from(offset));

    let mut result = conn
        .exec_iter(sql, Params::Positional(params))
        .await
        .map_err(|e| e.to_string())?;
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

pub async fn create_sql(conn: &mut mysql_async::Conn, table: &str) -> Result<String, String> {
    let safe = quote_ident_mysql(table)?;
    let row: Option<(String, String)> = conn
        .query_first(format!("SHOW CREATE TABLE {safe}"))
        .await
        .map_err(|e| e.to_string())?;
    row.map(|(_, ddl)| {
        if ddl.trim_end().ends_with(';') {
            ddl
        } else {
            format!("{ddl};")
        }
    })
    .ok_or_else(|| format!("no CREATE SQL for table {table}"))
}

pub async fn run_sql(conn: &mut mysql_async::Conn, sql: &str) -> Result<QueryResult, String> {
    if is_result_query(sql) {
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
