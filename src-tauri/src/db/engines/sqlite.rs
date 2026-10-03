use rusqlite::{types::ValueRef, Connection, Rows};

use super::super::config::ConnectionConfig;
use super::super::types::{
    build_filter_sort, is_result_query, quote_ident, split_table, ColumnInfo, ForeignKeyInfo,
    IndexInfo, PlaceholderStyle, QueryResult, SchemaNode, TableDetails, TableFilter, TableSort,
};

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

pub fn describe_table(db: &Connection, table: &str) -> Result<TableDetails, String> {
    let (_, name) = split_table(table);
    let safe = quote_ident(name)?;

    let mut columns = Vec::new();
    let mut stmt = db
        .prepare(&format!("PRAGMA table_info({safe})"))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let pk: i64 = r.get(5)?;
            Ok(ColumnInfo {
                name: r.get(1)?,
                data_type: r.get::<_, String>(2).unwrap_or_default(),
                nullable: r.get::<_, i64>(3)? == 0,
                default_value: r.get(4)?,
                is_pk: pk > 0,
            })
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        columns.push(row.map_err(|e| e.to_string())?);
    }

    let mut foreign_keys = Vec::new();
    let mut stmt = db
        .prepare(&format!("PRAGMA foreign_key_list({safe})"))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ForeignKeyInfo {
                name: format!("fk_{}", r.get::<_, i64>(0)?),
                columns: vec![r.get(3)?],
                ref_table: r.get(2)?,
                ref_columns: vec![r.get(4)?],
            })
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        foreign_keys.push(row.map_err(|e| e.to_string())?);
    }

    let mut indexes = Vec::new();
    let mut stmt = db
        .prepare(&format!("PRAGMA index_list({safe})"))
        .map_err(|e| e.to_string())?;
    let idx_meta: Vec<(String, bool)> = stmt
        .query_map([], |r| {
            let unique: i64 = r.get(2)?;
            Ok((r.get::<_, String>(1)?, unique != 0))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (idx_name, unique) in idx_meta {
        let q = quote_ident(&idx_name)?;
        let mut s = db
            .prepare(&format!("PRAGMA index_info({q})"))
            .map_err(|e| e.to_string())?;
        let cols: Vec<String> = s
            .query_map([], |r| r.get(2))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        indexes.push(IndexInfo {
            name: idx_name,
            unique,
            columns: cols,
        });
    }

    Ok(TableDetails {
        columns,
        foreign_keys,
        indexes,
    })
}

pub fn preview_table(
    db: &Connection,
    table: &str,
    limit: u32,
    offset: u32,
    filters: &[TableFilter],
    sort: Option<&TableSort>,
) -> Result<QueryResult, String> {
    let safe = quote_ident(table)?;
    let (where_sql, order_sql, binds) =
        build_filter_sort(filters, sort, quote_ident, PlaceholderStyle::Question)?;
    let sql = format!("SELECT * FROM {safe}{where_sql}{order_sql} LIMIT ? OFFSET ?");
    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let columns: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = binds
        .into_iter()
        .map(|v| Box::new(v) as Box<dyn rusqlite::types::ToSql>)
        .collect();
    params.push(Box::new(limit));
    params.push(Box::new(offset));
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let mut rows_iter = stmt.query(param_refs.as_slice()).map_err(|e| e.to_string())?;
    let rows = collect_rows(&mut rows_iter, columns.len())?;
    Ok(QueryResult {
        columns,
        rows,
        rows_affected: None,
    })
}

pub fn create_sql(db: &Connection, table: &str) -> Result<String, String> {
    let (_, name) = split_table(table);
    db.query_row(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [name],
        |r| r.get::<_, Option<String>>(0),
    )
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("no CREATE SQL for table {name}"))
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
