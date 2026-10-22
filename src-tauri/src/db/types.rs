use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaNode {
    pub name: String,
    pub kind: String,
    pub children: Vec<SchemaNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub rows_affected: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub is_pk: bool,
    /// Generation expression when the column is generated/stored/virtual.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generated: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckConstraintInfo {
    pub name: String,
    pub definition: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeyInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub ref_table: String,
    pub ref_columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    pub name: String,
    pub unique: bool,
    pub columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableDetails {
    pub columns: Vec<ColumnInfo>,
    pub foreign_keys: Vec<ForeignKeyInfo>,
    pub indexes: Vec<IndexInfo>,
    #[serde(default)]
    pub check_constraints: Vec<CheckConstraintInfo>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableFilter {
    pub column: String,
    pub op: String,
    pub value: Option<String>,
    /// How this filter joins the previous one (`and` | `or`). Ignored on the first.
    #[serde(default)]
    pub join: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSort {
    pub column: String,
    pub desc: bool,
}

#[derive(Debug, Clone, Copy)]
pub enum PlaceholderStyle {
    Question, // ?, ?
    Dollar,   // $1, $2
    Inline,   // 'escaped' literals (mssql)
}

pub fn quote_ident(name: &str) -> Result<String, String> {
    quote_with(name, '"')
}

pub fn quote_ident_mysql(name: &str) -> Result<String, String> {
    quote_with(name, '`')
}

fn quote_with(name: &str, q: char) -> Result<String, String> {
    if name.is_empty() || name.contains('\0') || name.contains(q) {
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
            .map(|p| format!("{q}{p}{q}"))
            .collect::<Vec<_>>()
            .join("."));
    }
    Ok(format!("{q}{name}{q}"))
}

pub fn split_table(table: &str) -> (Option<&str>, &str) {
    if let Some((schema, name)) = table.rsplit_once('.') {
        (Some(schema), name)
    } else {
        (None, table)
    }
}

/// Build WHERE + ORDER BY fragments. Returns (where_sql_without_keyword, order_sql_with_order_by, bind_values).
pub fn build_filter_sort(
    filters: &[TableFilter],
    sort: Option<&TableSort>,
    quote: fn(&str) -> Result<String, String>,
    style: PlaceholderStyle,
) -> Result<(String, String, Vec<String>), String> {
    let mut binds = Vec::new();
    let mut parts = Vec::new();
    for f in filters {
        let col = quote(&f.column)?;
        let op = f.op.to_lowercase();
        match op.as_str() {
            "is_null" => parts.push(format!("{col} IS NULL")),
            "is_not_null" => parts.push(format!("{col} IS NOT NULL")),
            "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "like" => {
                let sql_op = match op.as_str() {
                    "eq" => "=",
                    "ne" => "<>",
                    "gt" => ">",
                    "gte" => ">=",
                    "lt" => "<",
                    "lte" => "<=",
                    "like" => "LIKE",
                    _ => unreachable!(),
                };
                let val = f.value.clone().unwrap_or_default();
                match style {
                    PlaceholderStyle::Inline => {
                        let lit = format!("'{}'", val.replace('\'', "''"));
                        parts.push(format!("{col} {sql_op} {lit}"));
                    }
                    _ => {
                        let ph = next_placeholder(style, binds.len() + 1);
                        binds.push(val);
                        parts.push(format!("{col} {sql_op} {ph}"));
                    }
                }
            }
            other => return Err(format!("unsupported filter op: {other}")),
        }
    }
    let where_sql = if parts.is_empty() {
        String::new()
    } else {
        let mut clause = parts[0].clone();
        for (i, part) in parts.iter().enumerate().skip(1) {
            let join = filters
                .get(i)
                .and_then(|f| f.join.as_deref())
                .unwrap_or("and")
                .to_ascii_lowercase();
            let kw = if join == "or" { "OR" } else { "AND" };
            clause.push_str(&format!(" {kw} {part}"));
        }
        format!(" WHERE {clause}")
    };

    let order_sql = if let Some(s) = sort {
        let col = quote(&s.column)?;
        let dir = if s.desc { "DESC" } else { "ASC" };
        format!(" ORDER BY {col} {dir}")
    } else {
        String::new()
    };

    Ok((where_sql, order_sql, binds))
}

fn next_placeholder(style: PlaceholderStyle, n: usize) -> String {
    match style {
        PlaceholderStyle::Question => "?".into(),
        PlaceholderStyle::Dollar => format!("${n}"),
        PlaceholderStyle::Inline => unreachable!(),
    }
}

pub fn is_result_query(sql: &str) -> bool {
    let lower = sql.trim_start().to_lowercase();
    lower.starts_with("select")
        || lower.starts_with("with")
        || lower.starts_with("pragma")
        || lower.starts_with("show")
        || lower.starts_with("describe")
        || lower.starts_with("desc")
        || lower.starts_with("explain")
        || lower.starts_with("values")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quote_ident_accepts_and_rejects() {
        assert_eq!(quote_ident("users").unwrap(), "\"users\"");
        assert_eq!(quote_ident("public.users").unwrap(), "\"public\".\"users\"");
        assert!(quote_ident("").is_err());
        assert!(quote_ident("a\"b").is_err());
        assert!(quote_ident("a-b").is_err());
        assert_eq!(quote_ident_mysql("t").unwrap(), "`t`");
        assert!(quote_ident_mysql("a`b").is_err());
    }

    #[test]
    fn build_filter_sort_styles() {
        let filters = vec![
            TableFilter {
                column: "id".into(),
                op: "eq".into(),
                value: Some("1".into()),
                join: None,
            },
            TableFilter {
                column: "name".into(),
                op: "like".into(),
                value: Some("%a%".into()),
                join: Some("or".into()),
            },
        ];
        let sort = TableSort {
            column: "id".into(),
            desc: true,
        };

        let (w, o, b) =
            build_filter_sort(&filters, Some(&sort), quote_ident, PlaceholderStyle::Question)
                .unwrap();
        assert!(w.contains("\"id\" = ?"));
        assert!(w.contains("OR \"name\" LIKE ?"));
        assert_eq!(o, " ORDER BY \"id\" DESC");
        assert_eq!(b, vec!["1".to_string(), "%a%".to_string()]);

        let (w, _, b) =
            build_filter_sort(&filters, None, quote_ident, PlaceholderStyle::Dollar).unwrap();
        assert!(w.contains("$1"));
        assert!(w.contains("$2"));
        assert_eq!(b.len(), 2);

        let (w, _, b) = build_filter_sort(
            &filters[..1],
            None,
            quote_ident,
            PlaceholderStyle::Inline,
        )
        .unwrap();
        assert!(w.contains("\"id\" = '1'"));
        assert!(b.is_empty());

        let null_f = [TableFilter {
            column: "x".into(),
            op: "is_null".into(),
            value: None,
            join: None,
        }];
        let (w, _, b) =
            build_filter_sort(&null_f, None, quote_ident_mysql, PlaceholderStyle::Question)
                .unwrap();
        assert_eq!(w, " WHERE `x` IS NULL");
        assert!(b.is_empty());
    }

    #[test]
    fn is_result_query_detects_reads() {
        assert!(is_result_query("SELECT 1"));
        assert!(is_result_query("  with x as (select 1) select * from x"));
        assert!(!is_result_query("DELETE FROM t"));
    }
}
