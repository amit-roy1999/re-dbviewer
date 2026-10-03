use serde_json::Value;

use super::types::{quote_ident, quote_ident_mysql, ColumnInfo, ForeignKeyInfo, QueryResult, TableDetails};

pub const EXPORT_ROW_CAP: usize = 500_000;
pub const EXPORT_CHUNK: u32 = 1_000;
pub const IMPORT_BYTES_CAP: usize = 50 * 1024 * 1024;

pub fn rows_to_csv(result: &QueryResult) -> String {
    let mut out = String::new();
    out.push_str(
        &result
            .columns
            .iter()
            .map(|c| csv_escape(c))
            .collect::<Vec<_>>()
            .join(","),
    );
    out.push('\n');
    for row in &result.rows {
        let line = row
            .iter()
            .map(value_to_csv_cell)
            .collect::<Vec<_>>()
            .join(",");
        out.push_str(&line);
        out.push('\n');
    }
    out
}

pub fn rows_to_inserts(table: &str, result: &QueryResult, mysql_style: bool) -> Result<String, String> {
    if result.columns.is_empty() {
        return Ok(String::new());
    }
    let q = if mysql_style {
        quote_ident_mysql
    } else {
        quote_ident
    };
    let safe = q(table)?;
    let cols = result
        .columns
        .iter()
        .map(|c| q(c))
        .collect::<Result<Vec<_>, _>>()?
        .join(", ");
    let mut out = String::new();
    for row in &result.rows {
        let vals = row.iter().map(sql_literal).collect::<Vec<_>>().join(", ");
        out.push_str(&format!("INSERT INTO {safe} ({cols}) VALUES ({vals});\n"));
    }
    Ok(out)
}

pub fn synthesize_create(table: &str, details: &TableDetails, mysql_style: bool) -> Result<String, String> {
    let q = if mysql_style {
        quote_ident_mysql
    } else {
        quote_ident
    };
    let safe = q(table)?;
    let mut lines = Vec::new();
    for c in &details.columns {
        lines.push(column_ddl(c, q)?);
    }
    let pks: Vec<String> = details
        .columns
        .iter()
        .filter(|c| c.is_pk)
        .map(|c| q(&c.name))
        .collect::<Result<Vec<_>, _>>()?;
    if !pks.is_empty() {
        lines.push(format!("PRIMARY KEY ({})", pks.join(", ")));
    }
    for fk in &details.foreign_keys {
        lines.push(fk_ddl(fk, q)?);
    }
    Ok(format!("CREATE TABLE {safe} (\n  {}\n);", lines.join(",\n  ")))
}

pub fn parse_csv(input: &str) -> Result<(Vec<String>, Vec<Vec<Option<String>>>), String> {
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut field = String::new();
    let mut row: Vec<String> = Vec::new();
    let mut in_quotes = false;
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    field.push('"');
                } else {
                    in_quotes = false;
                }
            } else {
                field.push(c);
            }
            continue;
        }
        match c {
            '"' => in_quotes = true,
            ',' => {
                row.push(std::mem::take(&mut field));
            }
            '\n' => {
                row.push(std::mem::take(&mut field));
                if !(row.len() == 1 && row[0].is_empty() && rows.is_empty()) {
                    rows.push(std::mem::take(&mut row));
                } else {
                    row.clear();
                }
            }
            '\r' => {
                if chars.peek() == Some(&'\n') {
                    chars.next();
                }
                row.push(std::mem::take(&mut field));
                rows.push(std::mem::take(&mut row));
            }
            _ => field.push(c),
        }
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(std::mem::take(&mut field));
        rows.push(row);
    }
    // drop trailing empty row from final newline
    if let Some(last) = rows.last() {
        if last.len() == 1 && last[0].is_empty() {
            rows.pop();
        }
    }
    if rows.is_empty() {
        return Err("CSV is empty".into());
    }
    let header = rows.remove(0);
    if header.is_empty() || header.iter().any(|h| h.is_empty()) {
        return Err("CSV header row is invalid".into());
    }
    let data = rows
        .into_iter()
        .map(|r| {
            r.into_iter()
                .map(|cell| if cell.is_empty() { None } else { Some(cell) })
                .collect()
        })
        .collect();
    Ok((header, data))
}

pub fn split_sql_statements(sql: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut chars = sql.chars().peekable();
    let mut in_single = false;
    let mut in_double = false;
    let mut in_backtick = false;
    while let Some(c) = chars.next() {
        if in_single {
            cur.push(c);
            if c == '\'' {
                if chars.peek() == Some(&'\'') {
                    cur.push(chars.next().unwrap());
                } else {
                    in_single = false;
                }
            }
            continue;
        }
        if in_double {
            cur.push(c);
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    cur.push(chars.next().unwrap());
                } else {
                    in_double = false;
                }
            }
            continue;
        }
        if in_backtick {
            cur.push(c);
            if c == '`' {
                in_backtick = false;
            }
            continue;
        }
        match c {
            '\'' => {
                in_single = true;
                cur.push(c);
            }
            '"' => {
                in_double = true;
                cur.push(c);
            }
            '`' => {
                in_backtick = true;
                cur.push(c);
            }
            ';' => {
                let stmt = cur.trim().to_string();
                if !stmt.is_empty() {
                    out.push(stmt);
                }
                cur.clear();
            }
            _ => cur.push(c),
        }
    }
    let stmt = cur.trim().to_string();
    if !stmt.is_empty() {
        out.push(stmt);
    }
    out
}

fn column_ddl(c: &ColumnInfo, q: fn(&str) -> Result<String, String>) -> Result<String, String> {
    let name = q(&c.name)?;
    let ty = if c.data_type.trim().is_empty() {
        "TEXT"
    } else {
        c.data_type.trim()
    };
    let mut s = format!("{name} {ty}");
    if !c.nullable {
        s.push_str(" NOT NULL");
    }
    if let Some(def) = &c.default_value {
        if !def.is_empty() {
            s.push_str(" DEFAULT ");
            s.push_str(def);
        }
    }
    Ok(s)
}

fn fk_ddl(fk: &ForeignKeyInfo, q: fn(&str) -> Result<String, String>) -> Result<String, String> {
    let cols = fk
        .columns
        .iter()
        .map(|c| q(c))
        .collect::<Result<Vec<_>, _>>()?
        .join(", ");
    let ref_cols = fk
        .ref_columns
        .iter()
        .map(|c| q(c))
        .collect::<Result<Vec<_>, _>>()?
        .join(", ");
    let ref_table = q(&fk.ref_table)?;
    Ok(format!(
        "FOREIGN KEY ({cols}) REFERENCES {ref_table} ({ref_cols})"
    ))
}

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn value_to_csv_cell(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::Bool(b) => if *b { "true" } else { "false" }.into(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => csv_escape(s),
        other => csv_escape(&other.to_string()),
    }
}

fn sql_literal(v: &Value) -> String {
    match v {
        Value::Null => "NULL".into(),
        Value::Bool(b) => if *b { "TRUE" } else { "FALSE" }.into(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => format!("'{}'", s.replace('\'', "''")),
        other => format!("'{}'", other.to_string().replace('\'', "''")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_roundtrip_simple() {
        let (h, rows) = parse_csv("a,b\n1,2\n").unwrap();
        assert_eq!(h, vec!["a", "b"]);
        assert_eq!(rows[0], vec![Some("1".into()), Some("2".into())]);
    }

    #[test]
    fn split_ignores_semicolon_in_string() {
        let stmts = split_sql_statements("INSERT INTO t VALUES ('a;b'); SELECT 1");
        assert_eq!(stmts.len(), 2);
    }
}
