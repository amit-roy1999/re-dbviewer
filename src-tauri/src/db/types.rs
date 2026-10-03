use serde::Serialize;

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

pub fn quote_ident(name: &str) -> Result<String, String> {
    if name.is_empty() || name.contains('\0') {
        return Err("invalid identifier".into());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
    {
        return Err("invalid identifier".into());
    }
    if name.contains('.') {
        let parts: Vec<_> = name
            .split('.')
            .map(|p| format!("\"{p}\""))
            .collect();
        return Ok(parts.join("."));
    }
    Ok(format!("\"{name}\""))
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
