use rusqlite::{types::ValueRef, Connection, Rows};

use super::super::config::ConnectionConfig;
use super::super::types::{is_result_query, quote_ident, QueryResult, SchemaNode};

pub fn test(config: &ConnectionConfig) -> Result<String, String> {
    let path = config.path_or_err()?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let v: String = conn
        .query_row("SELECT sqlite_version()", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(format!("ok (sqlite {v})"))
}

pub fn open(config: &ConnectionConfig) -> Result<Connection, String> {
    Connection::open(config.path_or_err()?).map_err(|e| e.to_string())
}

pub fn list_schema(db: &Connection) -> Result<Vec<SchemaNode>, String> {
    let mut stmt = db
        .prepare(
            "SELECT name, type FROM sqlite_master
             WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
             ORDER BY type, name",
        )
        .map_err(|e| e.to_string())?;
    let children = stmt
        .query_map([], |r| {
            Ok(SchemaNode {
                name: r.get(0)?,
                kind: r.get(1)?,
                children: vec![],
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(vec![SchemaNode {
        name: "main".into(),
        kind: "schema".into(),
        children,
    }])
}

pub fn preview_table(
    db: &Connection,
    table: &str,
    limit: u32,
    offset: u32,
) -> Result<QueryResult, String> {
    let safe = quote_ident(table)?;
    let sql = format!("SELECT * FROM {safe} LIMIT ?1 OFFSET ?2");
    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let columns: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut rows_iter = stmt
        .query(rusqlite::params![limit, offset])
        .map_err(|e| e.to_string())?;
    let rows = collect_rows(&mut rows_iter, columns.len())?;
    Ok(QueryResult {
        columns,
        rows,
        rows_affected: None,
    })
}

pub fn run_sql(db: &Connection, sql: &str) -> Result<QueryResult, String> {
    if is_result_query(sql) {
        let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
        let columns: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let mut rows_iter = stmt.query([]).map_err(|e| e.to_string())?;
        let rows = collect_rows(&mut rows_iter, columns.len())?;
        Ok(QueryResult {
            columns,
            rows,
            rows_affected: None,
        })
    } else {
        let affected = db.execute(sql, []).map_err(|e| e.to_string())? as u64;
        Ok(QueryResult {
            columns: vec!["rows_affected".into()],
            rows: vec![vec![serde_json::json!(affected)]],
            rows_affected: Some(affected),
        })
    }
}

fn value_to_json(v: ValueRef<'_>) -> serde_json::Value {
    match v {
        ValueRef::Null => serde_json::Value::Null,
        ValueRef::Integer(i) => serde_json::json!(i),
        ValueRef::Real(f) => serde_json::json!(f),
        ValueRef::Text(t) => serde_json::Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => serde_json::Value::String(format!("<blob {} bytes>", b.len())),
    }
}

fn collect_rows(rows: &mut Rows<'_>, ncols: usize) -> Result<Vec<Vec<serde_json::Value>>, String> {
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut vals = Vec::with_capacity(ncols);
        for i in 0..ncols {
            vals.push(value_to_json(row.get_ref(i).map_err(|e| e.to_string())?));
        }
        out.push(vals);
    }
    Ok(out)
}
