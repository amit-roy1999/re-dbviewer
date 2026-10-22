//! Fake data factory: plan types, generators, topo order, INSERT SQL builders.

use std::collections::{HashMap, HashSet, VecDeque};

use fake::faker::company::en::CompanyName;
use fake::faker::internet::en::SafeEmail;
use fake::faker::lorem::en::{Sentence, Word};
use fake::faker::name::en::{FirstName, LastName, Name};
use fake::faker::phone_number::en::PhoneNumber;
use fake::{Fake, Faker};
use rand::rngs::StdRng;
use rand::Rng;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::permissions::Permissions;
use super::types::{quote_ident, quote_ident_mysql, TableDetails};

pub const MAX_TABLES: usize = 50;
pub const MAX_ROWS_PER_TABLE: u32 = 100_000;
pub const MAX_ROWS_TOTAL: u64 = 500_000;
pub const BATCH_SIZE: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FakeWriteMode {
    Append,
    TruncateFill,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FakeDataPlan {
    pub mode: FakeWriteMode,
    #[serde(default)]
    pub seed: Option<u64>,
    pub tables: Vec<FakeTableSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FakeTableSpec {
    pub table: String,
    pub row_count: u32,
    pub columns: Vec<FakeColumnSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FakeColumnSpec {
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub len: Option<usize>,
    #[serde(default)]
    pub values: Option<Vec<String>>,
    #[serde(default)]
    pub ref_table: Option<String>,
    #[serde(default)]
    pub ref_column: Option<String>,
    #[serde(default)]
    pub start: Option<i64>,
    #[serde(default)]
    pub step: Option<i64>,
    /// Optional SQL type hint for `auto` (from describe_table).
    #[serde(default)]
    pub data_type: Option<String>,
    /// Column has a single-column UNIQUE / PRIMARY KEY constraint.
    #[serde(default)]
    pub unique: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FakeDataResult {
    pub tables: u32,
    pub rows: u64,
    pub log: Vec<String>,
}

pub fn validate_plan(plan: &FakeDataPlan, perms: &Permissions) -> Result<(), String> {
    if plan.tables.is_empty() {
        return Err("select at least one table".into());
    }
    if plan.tables.len() > MAX_TABLES {
        return Err(format!("at most {MAX_TABLES} tables per run"));
    }
    if !perms.allow_insert {
        return Err("INSERT is disabled for this connection".into());
    }
    if matches!(plan.mode, FakeWriteMode::TruncateFill)
        && !perms.allow_delete
        && !perms.allow_ddl
    {
        return Err("Truncate then fill requires DELETE or DDL permission".into());
    }
    let mut total = 0u64;
    for t in &plan.tables {
        if t.row_count > MAX_ROWS_PER_TABLE {
            return Err(format!(
                "{}: at most {MAX_ROWS_PER_TABLE} rows per table",
                t.table
            ));
        }
        total += u64::from(t.row_count);
        if t.columns.is_empty() {
            return Err(format!("{}: no columns configured", t.table));
        }
        if !t.columns.iter().any(|c| c.kind != "skip") {
            return Err(format!("{}: all columns are skip", t.table));
        }
    }
    if total > MAX_ROWS_TOTAL {
        return Err(format!("total rows exceed {MAX_ROWS_TOTAL}"));
    }
    Ok(())
}

/// Infer generator kind from column name + SQL type.
pub fn resolve_auto_kind(name: &str, data_type: &str) -> String {
    let n = name.to_ascii_lowercase();
    let t = data_type.to_ascii_lowercase();
    if n.contains("email") {
        return "email".into();
    }
    if n == "uuid" || n.ends_with("_uuid") || t.contains("uuid") {
        return "uuid".into();
    }
    if n.contains("phone") || n.contains("mobile") || n.contains("tel") {
        return "phone".into();
    }
    if n == "company" || n.ends_with("_company") {
        return "company".into();
    }
    if n == "name" || n.ends_with("_name") || n == "full_name" || n == "fullname" {
        if n.contains("first") {
            return "firstName".into();
        }
        if n.contains("last") || n.contains("sur") {
            return "lastName".into();
        }
        return "fullName".into();
    }
    if n.contains("first_name") || n == "firstname" {
        return "firstName".into();
    }
    if n.contains("last_name") || n == "lastname" || n == "surname" {
        return "lastName".into();
    }
    if t.contains("bool") || t == "bit" || t.contains("tinyint(1)") {
        return "bool".into();
    }
    if t.contains("date") && !t.contains("time") {
        return "date".into();
    }
    if t.contains("timestamp") || t.contains("datetime") {
        return "datetime".into();
    }
    if t.contains("int") || t.contains("serial") || t.contains("numeric") || t.contains("decimal")
    {
        if n == "id" || n.ends_with("_id") {
            return "sequence".into();
        }
        return "int".into();
    }
    if t.contains("float") || t.contains("double") || t.contains("real") {
        return "float".into();
    }
    if t.contains("json") {
        return "fixed".into(); // value "{}"
    }
    "string".into()
}

pub fn short_table_name(table: &str) -> &str {
    table.rsplit('.').next().unwrap_or(table)
}

pub fn table_schema(table: &str) -> Option<&str> {
    table.rfind('.').map(|i| &table[..i])
}

/// Qualify an unqualified FK ref using the child table's schema (e.g. `users` → `eloquent_demo.users`).
pub fn resolve_ref_table(child_table: &str, ref_table: &str) -> String {
    if ref_table.contains('.') {
        return ref_table.to_string();
    }
    match table_schema(child_table) {
        Some(s) => format!("{s}.{ref_table}"),
        None => ref_table.to_string(),
    }
}

/// Match an FK ref to a table name that is in the plan (handles schema qualification).
pub fn match_plan_table(plan_tables: &HashSet<String>, child_table: &str, ref_table: &str) -> Option<String> {
    if plan_tables.contains(ref_table) {
        return Some(ref_table.to_string());
    }
    let qualified = resolve_ref_table(child_table, ref_table);
    if plan_tables.contains(&qualified) {
        return Some(qualified);
    }
    let want = short_table_name(ref_table);
    let child_schema = table_schema(child_table);
    plan_tables
        .iter()
        .find(|n| {
            short_table_name(n) == want
                && (child_schema.is_none()
                    || table_schema(n) == child_schema
                    || table_schema(n).is_none())
        })
        .cloned()
}

/// Topological order of table names using fk edges from column specs.
pub fn topo_sort_tables(tables: &[FakeTableSpec]) -> Result<Vec<String>, String> {
    let names: HashSet<String> = tables.iter().map(|t| t.table.clone()).collect();
    let mut indeg: HashMap<String, usize> = names.iter().map(|n| (n.clone(), 0)).collect();
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();

    for t in tables {
        for c in &t.columns {
            if c.kind != "fk" {
                continue;
            }
            let Some(ref_table) = c.ref_table.as_ref() else {
                continue;
            };
            let Some(parent) = match_plan_table(&names, &t.table, ref_table) else {
                continue; // outside plan — seeded from existing rows at generate time
            };
            if parent == t.table {
                continue;
            }
            adj.entry(parent).or_default().push(t.table.clone());
            *indeg.entry(t.table.clone()).or_default() += 1;
        }
    }

    let mut q: VecDeque<String> = indeg
        .iter()
        .filter(|(_, d)| **d == 0)
        .map(|(n, _)| n.clone())
        .collect();
    let mut out = Vec::new();
    while let Some(n) = q.pop_front() {
        out.push(n.clone());
        if let Some(nexts) = adj.get(&n) {
            for m in nexts {
                if let Some(d) = indeg.get_mut(m) {
                    *d -= 1;
                    if *d == 0 {
                        q.push_back(m.clone());
                    }
                }
            }
        }
    }
    if out.len() != names.len() {
        return Err("circular foreign-key dependency among selected tables".into());
    }
    Ok(out)
}

pub fn sql_literal(engine: &str, v: &str) -> String {
    let esc = v.replace('\'', "''");
    if engine == "mysql" || engine == "mariadb" {
        format!("'{}'", esc.replace('\\', "\\\\"))
    } else {
        format!("'{esc}'")
    }
}

pub fn quote_table(engine: &str, table: &str) -> Result<String, String> {
    if engine == "mysql" || engine == "mariadb" {
        quote_ident_mysql(table)
    } else {
        quote_ident(table)
    }
}

pub fn effective_kind(col: &FakeColumnSpec) -> String {
    if col.kind == "auto" {
        resolve_auto_kind(&col.name, col.data_type.as_deref().unwrap_or(""))
    } else {
        col.kind.clone()
    }
}

/// `SELECT MAX(col) FROM table` for bumping sequences on append.
pub fn max_column_sql(engine: &str, table: &str, column: &str) -> Result<String, String> {
    let t = quote_table(engine, table)?;
    let c = quote_table(engine, column)?;
    Ok(format!("SELECT MAX({c}) AS m FROM {t}"))
}

/// Raise sequence `start` so new values sit after existing rows (and honor an explicit higher start).
pub fn bump_sequence_start(col: &mut FakeColumnSpec, max_existing: Option<i64>) {
    if effective_kind(col) != "sequence" {
        return;
    }
    let desired = col.start.unwrap_or(1);
    let next = match max_existing {
        Some(m) => (m + 1).max(desired),
        None => desired,
    };
    col.start = Some(next);
}

/// Parse `SELECT MAX(...)` cell (NULL → None).
pub fn parse_max_cell(v: &serde_json::Value) -> Option<i64> {
    match v {
        serde_json::Value::Null => None,
        serde_json::Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)),
        serde_json::Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

type Pool = HashMap<String, Vec<String>>; // "table.column" -> values

pub const FK_SAMPLE_LIMIT: usize = 5_000;

fn pool_key(table: &str, column: &str) -> String {
    format!("{table}.{column}")
}

/// Store a raw value under both qualified and short table keys so FK refs resolve either way.
pub fn pool_push(pools: &mut Pool, table: &str, column: &str, value: String) {
    let short = short_table_name(table);
    pools
        .entry(pool_key(table, column))
        .or_default()
        .push(value.clone());
    if short != table {
        pools
            .entry(pool_key(short, column))
            .or_default()
            .push(value);
    }
}

pub fn find_pool<'a>(
    pools: &'a Pool,
    child_table: &str,
    ref_table: &str,
    ref_column: &str,
) -> Option<&'a Vec<String>> {
    let qualified = resolve_ref_table(child_table, ref_table);
    for key in [
        pool_key(ref_table, ref_column),
        pool_key(&qualified, ref_column),
    ] {
        if let Some(v) = pools.get(&key) {
            if !v.is_empty() {
                return Some(v);
            }
        }
    }
    let want = short_table_name(ref_table);
    for (k, v) in pools {
        if v.is_empty() {
            continue;
        }
        if let Some((t, c)) = k.rsplit_once('.') {
            if c == ref_column && short_table_name(t) == want {
                return Some(v);
            }
        }
    }
    None
}

/// Sample existing column values to seed an FK pool when the parent isn't in the plan.
pub fn sample_column_sql(
    engine: &str,
    table: &str,
    column: &str,
    limit: usize,
) -> Result<String, String> {
    let t = quote_table(engine, table)?;
    let c = quote_table(engine, column)?;
    Ok(match engine {
        "mssql" => format!("SELECT TOP ({limit}) {c} AS v FROM {t}"),
        _ => format!("SELECT {c} AS v FROM {t} LIMIT {limit}"),
    })
}

pub fn json_cell_to_raw(v: &serde_json::Value) -> Option<String> {
    match v {
        serde_json::Value::Null => None,
        serde_json::Value::Bool(b) => Some(if *b { "1".into() } else { "0".into() }),
        serde_json::Value::Number(n) => Some(n.to_string()),
        serde_json::Value::String(s) => Some(s.clone()),
        _ => Some(v.to_string()),
    }
}

pub fn sql_from_raw(engine: &str, raw: &str) -> String {
    if raw == "NULL" {
        "NULL".into()
    } else if raw.parse::<i64>().is_ok() || raw.parse::<f64>().is_ok() {
        raw.to_string()
    } else {
        sql_literal(engine, raw)
    }
}

/// Single-column unique (or PK) column names from table details.
pub fn unique_column_names(details: &TableDetails) -> HashSet<String> {
    let mut out = HashSet::new();
    for c in &details.columns {
        if c.is_pk {
            out.insert(c.name.clone());
        }
    }
    for ix in &details.indexes {
        if ix.unique && ix.columns.len() == 1 {
            out.insert(ix.columns[0].clone());
        }
    }
    out
}

/// How many new parent rows are required so a UNIQUE FK can fill `child_rows`.
pub fn parent_rows_needed(child_rows: u32, unused_existing: usize) -> u32 {
    child_rows.saturating_sub(unused_existing as u32)
}

/// Pick `need` distinct unused values from a parent pool (for UNIQUE FK columns).
pub fn reserve_unique_values(
    pool: &[String],
    already_used: &HashSet<String>,
    need: usize,
    rng: &mut StdRng,
) -> Result<VecDeque<String>, (usize, usize)> {
    let mut seen = HashSet::new();
    let mut avail: Vec<String> = Vec::new();
    for v in pool {
        if already_used.contains(v) || !seen.insert(v.clone()) {
            continue;
        }
        avail.push(v.clone());
    }
    if avail.len() < need {
        return Err((avail.len(), need));
    }
    use rand::seq::SliceRandom;
    avail.shuffle(rng);
    Ok(avail.into_iter().take(need).collect())
}

pub fn gen_cell(
    col: &FakeColumnSpec,
    row_i: usize,
    engine: &str,
    rng: &mut StdRng,
    pools: &Pool,
    child_table: &str,
) -> Result<String, String> {
    let kind = effective_kind(col);
    match kind.as_str() {
        "skip" => Err("skip".into()), // caller filters
        "null" => Ok("NULL".into()),
        "fixed" => {
            let v = col.value.as_deref().unwrap_or("");
            if v.eq_ignore_ascii_case("null") {
                Ok("NULL".into())
            } else {
                Ok(sql_literal(engine, v))
            }
        }
        "uuid" => Ok(sql_literal(engine, &Uuid::new_v4().to_string())),
        "bool" => {
            let b: bool = rng.gen();
            Ok(if engine == "postgres" {
                if b { "TRUE" } else { "FALSE" }
            } else if b {
                "1"
            } else {
                "0"
            }
            .into())
        }
        "int" | "sequence" => {
            if kind == "sequence" {
                let start = col.start.unwrap_or(1);
                let step = col.step.unwrap_or(1);
                let n = start + step * row_i as i64;
                Ok(n.to_string())
            } else {
                let min = col.min.unwrap_or(0.0) as i64;
                let max = col.max.unwrap_or(1_000_000.0) as i64;
                let hi = max.max(min);
                Ok(rng.gen_range(min..=hi).to_string())
            }
        }
        "float" => {
            let min = col.min.unwrap_or(0.0);
            let max = col.max.unwrap_or(1000.0);
            let hi = max.max(min);
            let v: f64 = rng.gen_range(min..=hi);
            Ok(format!("{v:.4}"))
        }
        "string" => {
            let len = col.len.unwrap_or(12).clamp(1, 500);
            let s: String = (0..len).map(|_| rng.sample(rand::distributions::Alphanumeric) as char).collect();
            Ok(sql_literal(engine, &s))
        }
        "lorem" => {
            let s: String = Sentence(3..8).fake_with_rng(rng);
            Ok(sql_literal(engine, &s))
        }
        "email" => {
            let mut s: String = SafeEmail().fake_with_rng(rng);
            if col.unique {
                // Keep UNIQUE email columns collision-free across the batch.
                if let Some((local, domain)) = s.split_once('@') {
                    s = format!("{local}+{row_i}@{domain}");
                } else {
                    s = format!("{s}.{row_i}");
                }
            }
            Ok(sql_literal(engine, &s))
        }
        "fullName" => {
            let s: String = Name().fake_with_rng(rng);
            Ok(sql_literal(engine, &s))
        }
        "firstName" => {
            let s: String = FirstName().fake_with_rng(rng);
            Ok(sql_literal(engine, &s))
        }
        "lastName" => {
            let s: String = LastName().fake_with_rng(rng);
            Ok(sql_literal(engine, &s))
        }
        "phone" => {
            let s: String = PhoneNumber().fake_with_rng(rng);
            Ok(sql_literal(engine, &s))
        }
        "company" => {
            let s: String = CompanyName().fake_with_rng(rng);
            Ok(sql_literal(engine, &s))
        }
        "date" => {
            let y = rng.gen_range(2000..=2025);
            let m = rng.gen_range(1..=12);
            let d = rng.gen_range(1..=28);
            Ok(sql_literal(engine, &format!("{y:04}-{m:02}-{d:02}")))
        }
        "datetime" => {
            let y = rng.gen_range(2000..=2025);
            let m = rng.gen_range(1..=12);
            let d = rng.gen_range(1..=28);
            let h = rng.gen_range(0..=23);
            let mi = rng.gen_range(0..=59);
            let s = rng.gen_range(0..=59);
            Ok(sql_literal(
                engine,
                &format!("{y:04}-{m:02}-{d:02} {h:02}:{mi:02}:{s:02}"),
            ))
        }
        "enum" => {
            let vals = col.values.as_ref().ok_or("enum requires values")?;
            if vals.is_empty() {
                return Err("enum values empty".into());
            }
            let i = rng.gen_range(0..vals.len());
            Ok(sql_literal(engine, &vals[i]))
        }
        "fk" => {
            let rt = col
                .ref_table
                .as_ref()
                .ok_or_else(|| format!("fk {} missing refTable", col.name))?;
            let rc = col
                .ref_column
                .as_ref()
                .ok_or_else(|| format!("fk {} missing refColumn", col.name))?;
            let pool = find_pool(pools, child_table, rt, rc).ok_or_else(|| {
                let hint = resolve_ref_table(child_table, rt);
                format!(
                    "no values for FK {rt}.{rc} — add “{hint}” to the plan, or ensure that table already has rows"
                )
            })?;
            let i = rng.gen_range(0..pool.len());
            let raw = &pool[i];
            if raw == "NULL" {
                Ok("NULL".into())
            } else if raw.parse::<i64>().is_ok() || raw.parse::<f64>().is_ok() {
                Ok(raw.clone())
            } else {
                Ok(sql_literal(engine, raw))
            }
        }
        other => {
            let _ = Faker.fake_with_rng::<u8, _>(rng);
            let s: String = Word().fake_with_rng(rng);
            let _ = other;
            Ok(sql_literal(engine, &s))
        }
    }
}

/// Raw (unquoted) value for pooling PKs / FK sources.
pub fn raw_for_pool(sql_val: &str) -> String {
    if sql_val == "NULL" {
        return "NULL".into();
    }
    if sql_val.starts_with('\'') && sql_val.ends_with('\'') && sql_val.len() >= 2 {
        let inner = &sql_val[1..sql_val.len() - 1];
        return inner.replace("''", "'").replace("\\\\", "\\");
    }
    sql_val.to_string()
}

pub fn build_batch_insert(
    engine: &str,
    table: &str,
    col_names: &[String],
    value_rows: &[Vec<String>],
) -> Result<String, String> {
    let q = quote_table(engine, table)?;
    let cols = col_names
        .iter()
        .map(|c| quote_table(engine, c))
        .collect::<Result<Vec<_>, _>>()?
        .join(", ");
    let values = value_rows
        .iter()
        .map(|row| format!("({})", row.join(", ")))
        .collect::<Vec<_>>()
        .join(",\n");
    Ok(format!("INSERT INTO {q} ({cols}) VALUES\n{values}"))
}

pub fn truncate_sql(engine: &str, table: &str) -> Result<String, String> {
    let q = quote_table(engine, table)?;
    Ok(match engine {
        "sqlite" => format!("DELETE FROM {q}"),
        "mssql" => format!("DELETE FROM {q}"), // avoid TRUNCATE permission surprises
        _ => format!("TRUNCATE TABLE {q}"),
    })
}

/// Suggest default column specs from table details (UI helper; also useful in tests).
pub fn default_columns_from_details(details: &TableDetails) -> Vec<FakeColumnSpec> {
    let uniques = unique_column_names(details);
    details
        .columns
        .iter()
        .map(|c| {
            // Prefer sequence for integer PKs so FK pools work without a post-SELECT.
            let mut kind = if c.is_pk
                && (c.data_type.to_ascii_lowercase().contains("int")
                    || c.data_type.to_ascii_lowercase().contains("serial"))
            {
                "sequence".to_string()
            } else {
                "auto".to_string()
            };
            let mut ref_table = None;
            let mut ref_column = None;
            for fk in &details.foreign_keys {
                if let Some(i) = fk.columns.iter().position(|x| x == &c.name) {
                    kind = "fk".into();
                    ref_table = Some(fk.ref_table.clone());
                    ref_column = Some(
                        fk.ref_columns
                            .get(i)
                            .cloned()
                            .unwrap_or_else(|| "id".into()),
                    );
                    break;
                }
            }
            let value = if kind == "auto"
                && c.data_type.to_ascii_lowercase().contains("json")
            {
                Some("{}".into())
            } else {
                None
            };
            FakeColumnSpec {
                name: c.name.clone(),
                kind,
                value,
                min: None,
                max: None,
                len: None,
                values: None,
                ref_table,
                ref_column,
                start: Some(1),
                step: Some(1),
                data_type: Some(c.data_type.clone()),
                unique: uniques.contains(&c.name),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::permissions::Permissions;
    use crate::db::types::{ColumnInfo, ForeignKeyInfo, IndexInfo};
    use rand::SeedableRng;

    fn col(name: &str, kind: &str) -> FakeColumnSpec {
        FakeColumnSpec {
            name: name.into(),
            kind: kind.into(),
            value: None,
            min: None,
            max: None,
            len: None,
            values: None,
            ref_table: None,
            ref_column: None,
            start: Some(1),
            step: Some(1),
            data_type: None,
            unique: false,
        }
    }

    fn minimal_plan(tables: Vec<FakeTableSpec>) -> FakeDataPlan {
        FakeDataPlan {
            mode: FakeWriteMode::Append,
            seed: None,
            tables,
        }
    }

    #[test]
    fn auto_kind_heuristics() {
        assert_eq!(resolve_auto_kind("email", "TEXT"), "email");
        assert_eq!(resolve_auto_kind("user_id", "INT"), "sequence");
        assert_eq!(resolve_auto_kind("created_at", "TIMESTAMP"), "datetime");
        assert_eq!(resolve_auto_kind("is_active", "BOOLEAN"), "bool");
        assert_eq!(resolve_auto_kind("phone", "TEXT"), "phone");
        assert_eq!(resolve_auto_kind("company", "TEXT"), "company");
        assert_eq!(resolve_auto_kind("first_name", "TEXT"), "firstName");
        assert_eq!(resolve_auto_kind("born", "DATE"), "date");
        assert_eq!(resolve_auto_kind("payload", "JSON"), "fixed");
    }

    #[test]
    fn reserve_unique_skips_used_and_dupes() {
        let mut rng = StdRng::seed_from_u64(1);
        let pool = vec!["1".into(), "1".into(), "2".into(), "3".into(), "4".into()];
        let used = HashSet::from(["2".into()]);
        let q = reserve_unique_values(&pool, &used, 3, &mut rng).unwrap();
        assert_eq!(q.len(), 3);
        let set: HashSet<_> = q.into_iter().collect();
        assert!(!set.contains("2"));
        assert_eq!(set.len(), 3);
        let err = reserve_unique_values(&pool, &used, 10, &mut rng).unwrap_err();
        assert_eq!(err, (3, 10));
    }

    #[test]
    fn resolve_ref_uses_child_schema() {
        assert_eq!(
            resolve_ref_table("eloquent_demo.orders", "users"),
            "eloquent_demo.users"
        );
        let names: HashSet<String> = ["eloquent_demo.users".into(), "eloquent_demo.orders".into()]
            .into_iter()
            .collect();
        assert_eq!(
            match_plan_table(&names, "eloquent_demo.orders", "users").as_deref(),
            Some("eloquent_demo.users")
        );
    }

    #[test]
    fn bump_sequence_after_existing_max() {
        let mut col = FakeColumnSpec {
            name: "id".into(),
            kind: "sequence".into(),
            value: None,
            min: None,
            max: None,
            len: None,
            values: None,
            ref_table: None,
            ref_column: None,
            start: Some(1),
            step: Some(1),
            data_type: None,
            unique: false,
        };
        bump_sequence_start(&mut col, Some(100));
        assert_eq!(col.start, Some(101));
        bump_sequence_start(&mut col, Some(50));
        assert_eq!(col.start, Some(101)); // keeps higher explicit/bumped start
        assert_eq!(parse_max_cell(&serde_json::Value::Null), None);
        assert_eq!(
            parse_max_cell(&serde_json::json!(42)),
            Some(42)
        );
    }

    #[test]
    fn topo_parents_before_children() {
        let users = FakeTableSpec {
            table: "users".into(),
            row_count: 2,
            columns: vec![FakeColumnSpec {
                name: "id".into(),
                kind: "sequence".into(),
                value: None,
                min: None,
                max: None,
                len: None,
                values: None,
                ref_table: None,
                ref_column: None,
                start: Some(1),
                step: Some(1),
                data_type: None,
                unique: false,
            }],
        };
        let orders = FakeTableSpec {
            table: "orders".into(),
            row_count: 2,
            columns: vec![FakeColumnSpec {
                name: "user_id".into(),
                kind: "fk".into(),
                value: None,
                min: None,
                max: None,
                len: None,
                values: None,
                ref_table: Some("users".into()),
                ref_column: Some("id".into()),
                start: None,
                step: None,
                data_type: None,
                unique: false,
            }],
        };
        let order = topo_sort_tables(&[orders, users]).unwrap();
        assert_eq!(order, vec!["users".to_string(), "orders".to_string()]);
    }

    #[test]
    fn default_columns_marks_fk_and_skip_pk() {
        let d = TableDetails {
            columns: vec![
                ColumnInfo {
                    name: "id".into(),
                    data_type: "INTEGER".into(),
                    nullable: false,
                    default_value: None,
                    is_pk: true,
                    generated: None,
                },
                ColumnInfo {
                    name: "user_id".into(),
                    data_type: "INTEGER".into(),
                    nullable: false,
                    default_value: None,
                    is_pk: false,
                    generated: None,
                },
            ],
            foreign_keys: vec![ForeignKeyInfo {
                name: "fk".into(),
                columns: vec!["user_id".into()],
                ref_table: "users".into(),
                ref_columns: vec!["id".into()],
            }],
            indexes: vec![],
            check_constraints: vec![],
        };
        let cols = default_columns_from_details(&d);
        assert_eq!(cols[0].kind, "sequence");
        assert_eq!(cols[1].kind, "fk");
        assert_eq!(cols[1].ref_table.as_deref(), Some("users"));
    }

    #[test]
    fn validate_plan_rejects_empty_and_limits() {
        let ok_cols = vec![col("id", "sequence")];
        let perms = Permissions::default();
        assert!(validate_plan(&minimal_plan(vec![]), &perms)
            .unwrap_err()
            .contains("at least one"));

        let too_many: Vec<_> = (0..MAX_TABLES + 1)
            .map(|i| FakeTableSpec {
                table: format!("t{i}"),
                row_count: 1,
                columns: ok_cols.clone(),
            })
            .collect();
        assert!(validate_plan(&minimal_plan(too_many), &perms)
            .unwrap_err()
            .contains("at most"));

        let over_table = FakeTableSpec {
            table: "t".into(),
            row_count: MAX_ROWS_PER_TABLE + 1,
            columns: ok_cols.clone(),
        };
        assert!(validate_plan(&minimal_plan(vec![over_table]), &perms)
            .unwrap_err()
            .contains("rows per table"));

        let many_rows: Vec<_> = (0..6)
            .map(|i| FakeTableSpec {
                table: format!("t{i}"),
                row_count: 100_000,
                columns: ok_cols.clone(),
            })
            .collect();
        assert!(validate_plan(&minimal_plan(many_rows), &perms)
            .unwrap_err()
            .contains("total rows"));

        let all_skip = FakeTableSpec {
            table: "t".into(),
            row_count: 1,
            columns: vec![col("id", "skip")],
        };
        assert!(validate_plan(&minimal_plan(vec![all_skip]), &perms)
            .unwrap_err()
            .contains("skip"));

        let mut no_insert = Permissions::default();
        no_insert.allow_insert = false;
        let ok = FakeTableSpec {
            table: "t".into(),
            row_count: 1,
            columns: ok_cols.clone(),
        };
        assert!(validate_plan(&minimal_plan(vec![ok.clone()]), &no_insert)
            .unwrap_err()
            .to_lowercase()
            .contains("insert"));

        let mut no_trunc = Permissions::default();
        no_trunc.allow_delete = false;
        no_trunc.allow_ddl = false;
        let trunc = FakeDataPlan {
            mode: FakeWriteMode::TruncateFill,
            seed: None,
            tables: vec![ok.clone()],
        };
        assert!(validate_plan(&trunc, &no_trunc)
            .unwrap_err()
            .to_lowercase()
            .contains("truncate"));

        assert!(validate_plan(&minimal_plan(vec![ok]), &perms).is_ok());
    }

    #[test]
    fn topo_sort_detects_cycle() {
        let a = FakeTableSpec {
            table: "a".into(),
            row_count: 1,
            columns: vec![{
                let mut c = col("b_id", "fk");
                c.ref_table = Some("b".into());
                c.ref_column = Some("id".into());
                c
            }],
        };
        let b = FakeTableSpec {
            table: "b".into(),
            row_count: 1,
            columns: vec![{
                let mut c = col("a_id", "fk");
                c.ref_table = Some("a".into());
                c.ref_column = Some("id".into());
                c
            }],
        };
        let err = topo_sort_tables(&[a, b]).unwrap_err();
        assert!(err.contains("circular"));
    }

    #[test]
    fn topo_sort_ignores_fk_outside_plan() {
        let orders = FakeTableSpec {
            table: "orders".into(),
            row_count: 1,
            columns: vec![{
                let mut c = col("user_id", "fk");
                c.ref_table = Some("users".into());
                c.ref_column = Some("id".into());
                c
            }],
        };
        let order = topo_sort_tables(&[orders]).unwrap();
        assert_eq!(order, vec!["orders".to_string()]);
    }

    #[test]
    fn pool_push_find_pool_qualified_and_short() {
        let mut pools = HashMap::new();
        pool_push(&mut pools, "demo.users", "id", "7".into());
        let found = find_pool(&pools, "demo.orders", "users", "id").unwrap();
        assert_eq!(found, &vec!["7".to_string()]);
        let found2 = find_pool(&pools, "demo.orders", "demo.users", "id").unwrap();
        assert_eq!(found2, &vec!["7".to_string()]);
    }

    #[test]
    fn parent_rows_needed_saturating() {
        assert_eq!(parent_rows_needed(5, 10), 0);
        assert_eq!(parent_rows_needed(5, 3), 2);
        assert_eq!(parent_rows_needed(1000, 0), 1000);
    }

    #[test]
    fn parse_max_cell_string_and_float() {
        assert_eq!(parse_max_cell(&serde_json::json!("99")), Some(99));
        assert_eq!(parse_max_cell(&serde_json::json!(12.7)), Some(12));
    }

    #[test]
    fn unique_column_names_composite_unique_excluded() {
        let d = TableDetails {
            columns: vec![
                ColumnInfo {
                    name: "id".into(),
                    data_type: "INT".into(),
                    nullable: false,
                    default_value: None,
                    is_pk: true,
                    generated: None,
                },
                ColumnInfo {
                    name: "a".into(),
                    data_type: "INT".into(),
                    nullable: false,
                    default_value: None,
                    is_pk: false,
                    generated: None,
                },
                ColumnInfo {
                    name: "b".into(),
                    data_type: "INT".into(),
                    nullable: false,
                    default_value: None,
                    is_pk: false,
                    generated: None,
                },
                ColumnInfo {
                    name: "email".into(),
                    data_type: "TEXT".into(),
                    nullable: false,
                    default_value: None,
                    is_pk: false,
                    generated: None,
                },
            ],
            foreign_keys: vec![],
            indexes: vec![
                IndexInfo {
                    name: "ab".into(),
                    unique: true,
                    columns: vec!["a".into(), "b".into()],
                },
                IndexInfo {
                    name: "email_uq".into(),
                    unique: true,
                    columns: vec!["email".into()],
                },
            ],
            check_constraints: vec![],
        };
        let u = unique_column_names(&d);
        assert!(u.contains("id"));
        assert!(u.contains("email"));
        assert!(!u.contains("a"));
        assert!(!u.contains("b"));
    }

    #[test]
    fn gen_cell_matrix() {
        let mut rng = StdRng::seed_from_u64(42);
        let pools = HashMap::new();
        assert_eq!(
            gen_cell(&col("x", "null"), 0, "sqlite", &mut rng, &pools, "t").unwrap(),
            "NULL"
        );
        let mut fixed = col("x", "fixed");
        fixed.value = Some("NULL".into());
        assert_eq!(
            gen_cell(&fixed, 0, "sqlite", &mut rng, &pools, "t").unwrap(),
            "NULL"
        );
        fixed.value = Some("hi".into());
        assert!(gen_cell(&fixed, 0, "sqlite", &mut rng, &pools, "t")
            .unwrap()
            .contains("hi"));

        let mut seq = col("id", "sequence");
        seq.start = Some(10);
        seq.step = Some(2);
        assert_eq!(
            gen_cell(&seq, 3, "sqlite", &mut rng, &pools, "t").unwrap(),
            "16"
        );

        let mut en = col("s", "enum");
        en.values = Some(vec![]);
        assert!(gen_cell(&en, 0, "sqlite", &mut rng, &pools, "t").is_err());

        let mut fk = col("user_id", "fk");
        fk.ref_table = Some("users".into());
        fk.ref_column = Some("id".into());
        assert!(gen_cell(&fk, 0, "sqlite", &mut rng, &pools, "t")
            .unwrap_err()
            .contains("no values"));

        let mut email = col("email", "email");
        email.unique = true;
        let e = gen_cell(&email, 7, "sqlite", &mut rng, &pools, "t").unwrap();
        assert!(e.contains("+7@"), "{e}");

        let b = gen_cell(&col("flag", "bool"), 0, "postgres", &mut rng, &pools, "t").unwrap();
        assert!(b == "TRUE" || b == "FALSE", "{b}");
    }

    #[test]
    fn sql_from_raw_and_raw_for_pool_roundtrip() {
        assert_eq!(sql_from_raw("sqlite", "42"), "42");
        assert_eq!(sql_from_raw("sqlite", "NULL"), "NULL");
        let lit = sql_from_raw("sqlite", "o'brien");
        assert!(lit.contains("''"));
        assert_eq!(raw_for_pool(&lit), "o'brien");
    }

    #[test]
    fn sql_literal_mysql_escapes() {
        let mysql = sql_literal("mysql", "a\\b");
        assert!(mysql.contains("\\\\"), "{mysql}");
        let pg = sql_literal("postgres", "a\\b");
        assert!(!pg.contains("\\\\") || pg == "'a\\b'");
    }

    #[test]
    fn truncate_sql_by_engine() {
        assert!(truncate_sql("sqlite", "t").unwrap().starts_with("DELETE"));
        assert!(truncate_sql("mssql", "t").unwrap().starts_with("DELETE"));
        assert!(truncate_sql("postgres", "t")
            .unwrap()
            .contains("TRUNCATE"));
        assert!(truncate_sql("mysql", "demo.t")
            .unwrap()
            .contains("TRUNCATE"));
    }

    #[test]
    fn sample_column_sql_mssql_top() {
        let s = sample_column_sql("mssql", "dbo.t", "id", 5000).unwrap();
        assert!(s.contains("TOP (5000)"), "{s}");
        let m = sample_column_sql("mysql", "t", "id", 10).unwrap();
        assert!(m.contains("LIMIT 10"), "{m}");
    }

    #[test]
    fn build_batch_insert_quotes_identifiers() {
        let sql = build_batch_insert(
            "sqlite",
            "users",
            &["id".into(), "email".into()],
            &[vec!["1".into(), "'a@b.c'".into()], vec!["2".into(), "'d@e.f'".into()]],
        )
        .unwrap();
        assert!(sql.contains("INSERT INTO"));
        assert!(sql.contains("VALUES"));
        assert!(sql.matches("a@b.c").count() >= 1);
        assert!(sql.contains("2"));
    }
}
