use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Permissions {
    pub allow_select: bool,
    pub allow_insert: bool,
    pub allow_update: bool,
    pub allow_delete: bool,
    pub allow_ddl: bool,
}

impl Default for Permissions {
    fn default() -> Self {
        Self {
            allow_select: true,
            allow_insert: true,
            allow_update: true,
            allow_delete: true,
            allow_ddl: true,
        }
    }
}

impl Permissions {
    #[allow(dead_code)]
    pub fn is_restricted(&self) -> bool {
        !(self.allow_select
            && self.allow_insert
            && self.allow_update
            && self.allow_delete
            && self.allow_ddl)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SqlKind {
    Select,
    Insert,
    Update,
    Delete,
    Ddl,
    Other,
}

pub fn classify_sql(sql: &str) -> Result<SqlKind, String> {
    let trimmed = strip_leading_noise(sql);
    if trimmed.is_empty() {
        return Err("empty SQL".into());
    }
    // reject multi-statement for permission clarity
    if trimmed.matches(';').count() > 1
        || (trimmed.matches(';').count() == 1 && !trimmed.trim_end().ends_with(';'))
    {
        // allow single trailing semicolon; block extra statements
        let without_trail = trimmed.trim_end().trim_end_matches(';');
        if without_trail.contains(';') {
            return Err("multiple statements are not allowed".into());
        }
    }

    let first = first_keyword(trimmed)?;
    Ok(match first.as_str() {
        "select" | "with" | "values" | "show" | "describe" | "desc" | "explain" | "pragma" => {
            SqlKind::Select
        }
        "insert" | "replace" => SqlKind::Insert,
        "update" => SqlKind::Update,
        "delete" => SqlKind::Delete,
        "create" | "alter" | "drop" | "truncate" | "rename" | "comment" | "grant" | "revoke"
        | "analyze" | "vacuum" | "reindex" | "attach" | "detach" => SqlKind::Ddl,
        _ => SqlKind::Other,
    })
}

pub fn assert_sql_allowed(perms: &Permissions, sql: &str) -> Result<(), String> {
    match classify_sql(sql)? {
        SqlKind::Select => {
            if !perms.allow_select {
                return Err("SELECT (and read queries) are disabled for this connection".into());
            }
        }
        SqlKind::Insert => {
            if !perms.allow_insert {
                return Err("INSERT is disabled for this connection".into());
            }
        }
        SqlKind::Update => {
            if !perms.allow_update {
                return Err("UPDATE is disabled for this connection".into());
            }
        }
        SqlKind::Delete => {
            if !perms.allow_delete {
                return Err("DELETE is disabled for this connection".into());
            }
        }
        SqlKind::Ddl => {
            if !perms.allow_ddl {
                return Err("DDL is disabled for this connection".into());
            }
        }
        SqlKind::Other => {
            if !perms.allow_ddl {
                return Err("this statement is blocked by connection permissions".into());
            }
        }
    }
    Ok(())
}

fn strip_leading_noise(sql: &str) -> &str {
    let mut s = sql.trim_start();
    loop {
        if s.starts_with("--") {
            if let Some(pos) = s.find('\n') {
                s = s[pos + 1..].trim_start();
                continue;
            }
            return "";
        }
        if s.starts_with("/*") {
            if let Some(pos) = s.find("*/") {
                s = s[pos + 2..].trim_start();
                continue;
            }
            return "";
        }
        break;
    }
    s
}

fn first_keyword(sql: &str) -> Result<String, String> {
    let mut out = String::new();
    for c in sql.chars() {
        if c.is_ascii_alphabetic() || c == '_' {
            out.push(c.to_ascii_lowercase());
        } else if out.is_empty() {
            if c.is_whitespace() {
                continue;
            }
            break;
        } else {
            break;
        }
    }
    if out.is_empty() {
        return Err("could not classify SQL".into());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_delete_when_disabled() {
        let mut p = Permissions::default();
        p.allow_delete = false;
        assert!(assert_sql_allowed(&p, "DELETE FROM users").is_err());
        assert!(assert_sql_allowed(&p, "UPDATE users SET x=1").is_ok());
    }
}
