use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use super::app_store::SavedConnection;
use super::config::ConnectionConfig;
use super::engines::{mssql, mysql, postgres, sqlite};
use super::permissions::{assert_sql_allowed, Permissions};
use super::tunnel::{maybe_tunnel, Tunnel};
use super::transfer::{
    parse_csv, rows_to_csv, rows_to_inserts, split_sql_statements, synthesize_create,
    EXPORT_CHUNK, EXPORT_ROW_CAP, IMPORT_BYTES_CAP,
};
use super::types::{
    quote_ident, quote_ident_mysql, QueryResult, SchemaNode, TableDetails, TableFilter, TableSort,
};

enum LiveDb {
    Sqlite(rusqlite::Connection),
    Postgres(tokio_postgres::Client),
    Mysql(mysql_async::Conn),
    Mssql(mssql::MssqlClient),
}

struct OpenSession {
    connection: SavedConnection,
    // field order matters: db drops before the tunnel it rides on
    db: LiveDb,
    _tunnel: Option<Tunnel>,
}

/// Several open connections keyed by saved-connection id; one is "active" and is what
/// commands without an explicit `connection_id` operate on.
pub struct SessionState {
    sessions: Mutex<HashMap<String, Arc<Mutex<OpenSession>>>>,
    active: Mutex<Option<String>>,
}

impl SessionState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            active: Mutex::new(None),
        }
    }

    /// Opens (or re-opens) a connection and makes it active.
    pub fn open(&self, connection: SavedConnection) -> Result<(), String> {
        let (cfg, tunnel) = maybe_tunnel(&connection.engine, &connection.config)?;
        let db = open_engine(&connection.engine, &cfg)?;
        let id = connection.id.clone();
        let sess = Arc::new(Mutex::new(OpenSession {
            connection,
            db,
            _tunnel: tunnel,
        }));
        self.sessions
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id.clone(), sess);
        *self.active.lock().map_err(|e| e.to_string())? = Some(id);
        Ok(())
    }

    /// Closes the given connection, or the active one when `id` is None.
    pub fn close_id(&self, id: Option<&str>) -> Result<(), String> {
        let target = match id {
            Some(i) => Some(i.to_string()),
            None => self.active.lock().map_err(|e| e.to_string())?.clone(),
        };
        let Some(target) = target else { return Ok(()) };
        let mut map = self.sessions.lock().map_err(|e| e.to_string())?;
        map.remove(&target);
        let mut active = self.active.lock().map_err(|e| e.to_string())?;
        if active.as_deref() == Some(target.as_str()) {
            *active = map.keys().next().cloned();
        }
        Ok(())
    }

    #[cfg(test)]
    pub fn close(&self) -> Result<(), String> {
        self.close_id(None)
    }

    pub fn set_active(&self, id: &str) -> Result<(), String> {
        if !self
            .sessions
            .lock()
            .map_err(|e| e.to_string())?
            .contains_key(id)
        {
            return Err(format!("connection {id} is not open"));
        }
        *self.active.lock().map_err(|e| e.to_string())? = Some(id.to_string());
        Ok(())
    }

    pub fn open_ids(&self) -> Vec<String> {
        self.sessions
            .lock()
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default()
    }

    fn with_target<T>(
        &self,
        id: Option<&str>,
        f: impl FnOnce(&SavedConnection, &mut LiveDb) -> Result<T, String>,
    ) -> Result<T, String> {
        let key = match id {
            Some(i) => i.to_string(),
            None => self
                .active
                .lock()
                .map_err(|e| e.to_string())?
                .clone()
                .ok_or_else(|| "no connection open".to_string())?,
        };
        let arc = self
            .sessions
            .lock()
            .map_err(|e| e.to_string())?
            .get(&key)
            .cloned()
            .ok_or_else(|| format!("connection {key} is not open"))?;
        let mut session = arc.lock().map_err(|e| e.to_string())?;
        let OpenSession { connection, db, .. } = &mut *session;
        f(connection, db)
    }

    fn with_mut<T>(
        &self,
        f: impl FnOnce(&SavedConnection, &mut LiveDb) -> Result<T, String>,
    ) -> Result<T, String> {
        self.with_target(None, f)
    }

    pub fn list_schema_on(&self, id: Option<&str>) -> Result<Vec<SchemaNode>, String> {
        self.with_target(id, |_, db| match db {
            LiveDb::Sqlite(c) => sqlite::list_schema(c),
            LiveDb::Postgres(c) => block_on(postgres::list_schema(c)),
            LiveDb::Mysql(c) => block_on(mysql::list_schema(c)),
            LiveDb::Mssql(c) => block_on(mssql::list_schema(c)),
        })
    }

    pub fn describe_table_on(&self, id: Option<&str>, table: &str) -> Result<TableDetails, String> {
        self.with_target(id, |conn, db| {
            assert_sql_allowed(&conn.permissions, "SELECT 1")?;
            describe_table_inner(db, table)
        })
    }

    pub fn preview_table(
        &self,
        table: &str,
        limit: u32,
        offset: u32,
        filters: &[TableFilter],
        sort: Option<&TableSort>,
    ) -> Result<QueryResult, String> {
        self.with_mut(|conn, db| {
            assert_sql_allowed(&conn.permissions, "SELECT 1")?;
            preview_table_inner(db, table, limit, offset, filters, sort)
        })
    }

    pub fn run_sql_on(&self, id: Option<&str>, sql: &str) -> Result<QueryResult, String> {
        let trimmed = sql.trim();
        if trimmed.is_empty() {
            return Err("empty SQL".into());
        }
        self.with_target(id, |conn, db| {
            assert_sql_allowed(&conn.permissions, trimmed)?;
            run_sql_inner(db, trimmed)
        })
    }

    pub fn export_table_csv(
        &self,
        table: &str,
        filters: &[TableFilter],
        sort: Option<&TableSort>,
    ) -> Result<String, String> {
        let result = self.fetch_all(table, filters, sort)?;
        Ok(rows_to_csv(&result))
    }

    #[cfg(test)]
    pub fn export_table_sql(
        &self,
        table: &str,
        include_schema: bool,
        include_data: bool,
        filters: &[TableFilter],
        sort: Option<&TableSort>,
    ) -> Result<String, String> {
        self.export_table_sql_on(None, table, include_schema, include_data, filters, sort)
    }

    pub fn export_table_sql_on(
        &self,
        id: Option<&str>,
        table: &str,
        include_schema: bool,
        include_data: bool,
        filters: &[TableFilter],
        sort: Option<&TableSort>,
    ) -> Result<String, String> {
        if !include_schema && !include_data {
            return Err("include_schema or include_data required".into());
        }
        self.with_target(id, |conn, db| {
            assert_sql_allowed(&conn.permissions, "SELECT 1")?;
            let mysql_style = matches!(db, LiveDb::Mysql(_));
            let mut out = String::new();
            if include_schema {
                let ddl = match db {
                    LiveDb::Sqlite(c) => sqlite::create_sql(c, table)?,
                    LiveDb::Mysql(c) => block_on(mysql::create_sql(c, table))?,
                    LiveDb::Postgres(_) | LiveDb::Mssql(_) => {
                        let details = describe_table_inner(db, table)?;
                        synthesize_create(table, &details, false)?
                    }
                };
                out.push_str(ddl.trim_end_matches(';'));
                out.push_str(";\n\n");
            }
            if include_data {
                let data = fetch_all_inner(db, table, filters, sort)?;
                out.push_str(&rows_to_inserts(table, &data, mysql_style)?);
            }
            Ok(out)
        })
    }

    pub fn import_table_csv(
        &self,
        table: &str,
        csv: &str,
        mode: &str,
    ) -> Result<u64, String> {
        if csv.len() > IMPORT_BYTES_CAP {
            return Err("CSV exceeds 50MB limit".into());
        }
        let replace = match mode {
            "append" => false,
            "replace" => true,
            other => return Err(format!("unknown import mode: {other}")),
        };
        let (header, rows) = parse_csv(csv)?;
        self.with_mut(|conn, db| {
            if replace {
                assert_sql_allowed(&conn.permissions, &format!("DELETE FROM {table}"))?;
            }
            assert_sql_allowed(
                &conn.permissions,
                &format!("INSERT INTO {table} DEFAULT VALUES"),
            )?;

            let details = describe_table_inner(db, table)?;
            let known: Vec<&str> = details.columns.iter().map(|c| c.name.as_str()).collect();
            for h in &header {
                if !known.iter().any(|k| *k == h) {
                    return Err(format!("unknown column in CSV: {h}"));
                }
            }

            let mysql_style = matches!(db, LiveDb::Mysql(_));
            let q = if mysql_style {
                quote_ident_mysql
            } else {
                quote_ident
            };
            let safe = q(table)?;
            let cols = header
                .iter()
                .map(|c| q(c))
                .collect::<Result<Vec<_>, _>>()?
                .join(", ");

            if replace {
                run_sql_inner(db, &format!("DELETE FROM {safe}"))?;
            }

            let mut inserted = 0u64;
            for row in rows {
                if row.iter().all(|c| c.is_none()) {
                    continue;
                }
                let mut vals = Vec::with_capacity(header.len());
                for i in 0..header.len() {
                    match row.get(i).and_then(|c| c.as_ref()) {
                        None => vals.push("NULL".to_string()),
                        Some(s) => vals.push(format!("'{}'", s.replace('\'', "''"))),
                    }
                }
                // pad short rows
                while vals.len() < header.len() {
                    vals.push("NULL".into());
                }
                let sql = format!(
                    "INSERT INTO {safe} ({cols}) VALUES ({})",
                    vals.join(", ")
                );
                run_sql_inner(db, &sql)?;
                inserted += 1;
            }
            Ok(inserted)
        })
    }

    pub fn generate_fake_data_on(
        &self,
        id: Option<&str>,
        plan: super::fake_data::FakeDataPlan,
    ) -> Result<super::fake_data::FakeDataResult, String> {
        use super::fake_data::{
            build_batch_insert, topo_sort_tables, truncate_sql, validate_plan, FakeWriteMode,
            BATCH_SIZE,
        };
        use rand::rngs::StdRng;
        use rand::SeedableRng;
        use std::collections::HashMap;

        self.with_target(id, |conn, db| {
            let engine = conn.engine.as_str();
            let mut plan = plan;
            let mut log = Vec::new();
            auto_expand_unique_fk_parents(
                db,
                engine,
                &conn.permissions,
                &mut plan,
                &mut log,
            )?;
            validate_plan(&plan, &conn.permissions)?;
            let order = topo_sort_tables(&plan.tables)?;
            let by_name: HashMap<String, _> = plan
                .tables
                .iter()
                .map(|t| (t.table.clone(), t))
                .collect();

            let mut rng = match plan.seed {
                Some(s) => StdRng::seed_from_u64(s),
                None => StdRng::from_entropy(),
            };
            let mut pools: HashMap<String, Vec<String>> = HashMap::new();
            let mut total_rows = 0u64;

            if matches!(plan.mode, FakeWriteMode::TruncateFill) {
                // Children first when truncating
                for name in order.iter().rev() {
                    let sql = truncate_sql(engine, name)?;
                    assert_sql_allowed(&conn.permissions, &sql)?;
                    run_sql_inner(db, &sql)?;
                    log.push(format!("cleared {name}"));
                }
            }

            let append = matches!(plan.mode, FakeWriteMode::Append);

            for name in &order {
                let spec = by_name
                    .get(name)
                    .ok_or_else(|| format!("missing table spec: {name}"))?;
                let mut active_cols: Vec<_> = spec
                    .columns
                    .iter()
                    .filter(|c| c.kind != "skip")
                    .cloned()
                    .collect();
                if active_cols.is_empty() {
                    return Err(format!("{name}: no insertable columns"));
                }

                // Append: continue sequences after MAX so PKs don't collide with existing rows.
                if append {
                    for col in active_cols.iter_mut() {
                        if super::fake_data::effective_kind(col) != "sequence" {
                            continue;
                        }
                        let sql = super::fake_data::max_column_sql(engine, name, &col.name)?;
                        assert_sql_allowed(&conn.permissions, &sql)?;
                        let res = run_sql_inner(db, &sql)?;
                        let max = res
                            .rows
                            .first()
                            .and_then(|r| r.first())
                            .and_then(super::fake_data::parse_max_cell);
                        let before = col.start.unwrap_or(1);
                        super::fake_data::bump_sequence_start(col, max);
                        if col.start.unwrap_or(1) != before {
                            log.push(format!(
                                "{name}.{}: sequence start → {}",
                                col.name,
                                col.start.unwrap_or(1)
                            ));
                        }
                    }
                }

                // Seed FK pools from existing parent rows when parent isn't in this plan.
                for col in &active_cols {
                    if super::fake_data::effective_kind(col) != "fk" {
                        continue;
                    }
                    let Some(rt) = col.ref_table.as_deref() else {
                        continue;
                    };
                    let Some(rc) = col.ref_column.as_deref() else {
                        continue;
                    };
                    if super::fake_data::find_pool(&pools, name, rt, rc).is_some() {
                        continue;
                    }
                    let qualified = super::fake_data::resolve_ref_table(name, rt);
                    let mut loaded = false;
                    for parent in [qualified.as_str(), rt] {
                        let sql = super::fake_data::sample_column_sql(
                            engine,
                            parent,
                            rc,
                            super::fake_data::FK_SAMPLE_LIMIT,
                        )?;
                        assert_sql_allowed(&conn.permissions, &sql)?;
                        match run_sql_inner(db, &sql) {
                            Ok(res) => {
                                let mut n = 0usize;
                                for row in &res.rows {
                                    if let Some(cell) = row.first() {
                                        if let Some(raw) =
                                            super::fake_data::json_cell_to_raw(cell)
                                        {
                                            super::fake_data::pool_push(
                                                &mut pools, parent, rc, raw,
                                            );
                                            n += 1;
                                        }
                                    }
                                }
                                if n > 0 {
                                    log.push(format!(
                                        "using {n} existing {parent}.{rc} value(s) for FKs"
                                    ));
                                    loaded = true;
                                    break;
                                }
                            }
                            Err(_) => continue,
                        }
                    }
                    if !loaded {
                        return Err(format!(
                            "no values for FK {rt}.{rc} — add “{qualified}” to the plan (or + related), or ensure that table already has rows"
                        ));
                    }
                }

                // UNIQUE FK columns: assign each parent key at most once (skip values
                // already present in the child when appending).
                let mut unique_fk: HashMap<String, std::collections::VecDeque<String>> =
                    HashMap::new();
                for col in &active_cols {
                    if !col.unique || super::fake_data::effective_kind(col) != "fk" {
                        continue;
                    }
                    let Some(rt) = col.ref_table.as_deref() else {
                        continue;
                    };
                    let Some(rc) = col.ref_column.as_deref() else {
                        continue;
                    };
                    let mut used = std::collections::HashSet::new();
                    if append {
                        used = load_column_raw_set(db, engine, &conn.permissions, name, &col.name)?;
                    }
                    // Merge existing parent keys into the pool (plus any generated this run).
                    let qualified = super::fake_data::resolve_ref_table(name, rt);
                    for parent in [qualified.as_str(), rt] {
                        if let Ok(keys) =
                            load_column_raw_set(db, engine, &conn.permissions, parent, rc)
                        {
                            for raw in keys {
                                super::fake_data::pool_push(&mut pools, parent, rc, raw);
                            }
                            break;
                        }
                    }
                    let pool = super::fake_data::find_pool(&pools, name, rt, rc)
                        .ok_or_else(|| format!("no FK pool for unique {}.{}", name, col.name))?;
                    let need = spec.row_count as usize;
                    match super::fake_data::reserve_unique_values(pool, &used, need, &mut rng) {
                        Ok(q) => {
                            log.push(format!(
                                "{name}.{}: unique FK — reserved {need} unused parent key(s)",
                                col.name
                            ));
                            unique_fk.insert(col.name.clone(), q);
                        }
                        Err((have, need)) => {
                            return Err(format!(
                                "{name}.{} is UNIQUE, but only {have} unused {rt}.{rc} value(s) (need {need}). Add more parent rows (or include the parent table), or lower the row count.",
                                col.name
                            ));
                        }
                    }
                }

                let col_names: Vec<String> = active_cols.iter().map(|c| c.name.clone()).collect();

                assert_sql_allowed(
                    &conn.permissions,
                    &format!("INSERT INTO {name} DEFAULT VALUES"),
                )?;

                let mut inserted = 0u64;
                let mut batch: Vec<Vec<String>> = Vec::new();
                let mut batch_raw: Vec<Vec<String>> = Vec::new();

                let flush = |db: &mut LiveDb,
                             batch: &mut Vec<Vec<String>>,
                             batch_raw: &mut Vec<Vec<String>>,
                             pools: &mut HashMap<String, Vec<String>>,
                             inserted: &mut u64|
                 -> Result<(), String> {
                    if batch.is_empty() {
                        return Ok(());
                    }
                    let sql = build_batch_insert(engine, name, &col_names, batch)?;
                    run_sql_inner(db, &sql)?;
                    for raw_row in batch_raw.iter() {
                        for (i, col) in active_cols.iter().enumerate() {
                            super::fake_data::pool_push(
                                pools,
                                name,
                                &col.name,
                                raw_row[i].clone(),
                            );
                        }
                    }
                    *inserted += batch.len() as u64;
                    batch.clear();
                    batch_raw.clear();
                    Ok(())
                };

                for row_i in 0..spec.row_count as usize {
                    let mut sql_vals = Vec::with_capacity(active_cols.len());
                    let mut raw_vals = Vec::with_capacity(active_cols.len());
                    for col in &active_cols {
                        let sql_v = if let Some(q) = unique_fk.get_mut(&col.name) {
                            let raw = q.pop_front().ok_or_else(|| {
                                format!("internal: unique FK queue empty for {}", col.name)
                            })?;
                            super::fake_data::sql_from_raw(engine, &raw)
                        } else {
                            super::fake_data::gen_cell(
                                col, row_i, engine, &mut rng, &pools, name,
                            )?
                        };
                        raw_vals.push(super::fake_data::raw_for_pool(&sql_v));
                        sql_vals.push(sql_v);
                    }
                    batch.push(sql_vals);
                    batch_raw.push(raw_vals);
                    if batch.len() >= BATCH_SIZE {
                        flush(db, &mut batch, &mut batch_raw, &mut pools, &mut inserted)?;
                    }
                }
                flush(db, &mut batch, &mut batch_raw, &mut pools, &mut inserted)?;
                total_rows += inserted;
                log.push(format!("inserted {inserted} row(s) into {name}"));
            }

            Ok(super::fake_data::FakeDataResult {
                tables: order.len() as u32,
                rows: total_rows,
                log,
            })
        })
    }

    pub fn run_sql_script_on(&self, id: Option<&str>, sql: &str) -> Result<u64, String> {
        if sql.len() > IMPORT_BYTES_CAP {
            return Err("SQL script exceeds 50MB limit".into());
        }
        let stmts = split_sql_statements(sql);
        if stmts.is_empty() {
            return Err("SQL script is empty".into());
        }
        let mut ran = 0u64;
        for stmt in stmts {
            self.run_sql_on(id, &stmt)?;
            ran += 1;
        }
        Ok(ran)
    }

    fn fetch_all(
        &self,
        table: &str,
        filters: &[TableFilter],
        sort: Option<&TableSort>,
    ) -> Result<QueryResult, String> {
        self.with_mut(|conn, db| {
            assert_sql_allowed(&conn.permissions, "SELECT 1")?;
            fetch_all_inner(db, table, filters, sort)
        })
    }
}

fn describe_table_inner(db: &mut LiveDb, table: &str) -> Result<TableDetails, String> {
    match db {
        LiveDb::Sqlite(c) => sqlite::describe_table(c, table),
        LiveDb::Postgres(c) => block_on(postgres::describe_table(c, table)),
        LiveDb::Mysql(c) => block_on(mysql::describe_table(c, table)),
        LiveDb::Mssql(c) => block_on(mssql::describe_table(c, table)),
    }
}

fn load_column_raw_set(
    db: &mut LiveDb,
    engine: &str,
    perms: &Permissions,
    table: &str,
    column: &str,
) -> Result<std::collections::HashSet<String>, String> {
    use super::fake_data::{json_cell_to_raw, sample_column_sql, FK_SAMPLE_LIMIT};
    let sql = sample_column_sql(engine, table, column, FK_SAMPLE_LIMIT)?;
    assert_sql_allowed(perms, &sql)?;
    let mut out = std::collections::HashSet::new();
    match run_sql_inner(db, &sql) {
        Ok(res) => {
            for row in &res.rows {
                if let Some(cell) = row.first() {
                    if let Some(raw) = json_cell_to_raw(cell) {
                        out.insert(raw);
                    }
                }
            }
        }
        Err(_) => {}
    }
    Ok(out)
}

/// Ensure UNIQUE FK children have enough unused parent keys by auto-adding / bumping parents.
fn auto_expand_unique_fk_parents(
    db: &mut LiveDb,
    engine: &str,
    perms: &Permissions,
    plan: &mut super::fake_data::FakeDataPlan,
    log: &mut Vec<String>,
) -> Result<(), String> {
    use super::fake_data::{
        default_columns_from_details, effective_kind, match_plan_table, parent_rows_needed,
        resolve_ref_table, FakeTableSpec, FakeWriteMode,
    };
    use std::collections::HashSet;

    let append = matches!(plan.mode, FakeWriteMode::Append);

    for _pass in 0..6 {
        let snapshot: Vec<(String, u32, Vec<_>)> = plan
            .tables
            .iter()
            .map(|t| (t.table.clone(), t.row_count, t.columns.clone()))
            .collect();
        let names: HashSet<String> = snapshot.iter().map(|(t, _, _)| t.clone()).collect();
        let mut changed = false;

        for (child, child_rows, columns) in &snapshot {
            for col in columns {
                if !col.unique || effective_kind(col) != "fk" {
                    continue;
                }
                let Some(rt) = col.ref_table.as_deref() else {
                    continue;
                };
                let Some(rc) = col.ref_column.as_deref() else {
                    continue;
                };
                let parent = resolve_ref_table(child, rt);
                let parent_in_plan = match_plan_table(&names, child, rt);

                // Truncating a parent wipes existing keys; only leftover unused keys help on append
                // when the parent stays out of the plan (or we keep its rows).
                let unused = if !append && parent_in_plan.is_some() {
                    0
                } else {
                    let parents = load_column_raw_set(db, engine, perms, &parent, rc).or_else(
                        |_| load_column_raw_set(db, engine, perms, rt, rc),
                    )?;
                    let used = load_column_raw_set(db, engine, perms, child, &col.name)?;
                    parents.difference(&used).count()
                };

                let planned_new = parent_in_plan
                    .as_ref()
                    .and_then(|p| {
                        plan.tables
                            .iter()
                            .find(|t| &t.table == p)
                            .map(|t| t.row_count)
                    })
                    .unwrap_or(0);
                // Need unused + new_parent_rows >= child_rows
                let need_new = parent_rows_needed(*child_rows, unused);
                if planned_new >= need_new {
                    continue;
                }

                if let Some(pref) = parent_in_plan {
                    if let Some(t) = plan.tables.iter_mut().find(|t| t.table == pref) {
                        log.push(format!(
                            "auto-bumped {pref} to {need_new} rows (unique FK {child}.{})",
                            col.name
                        ));
                        t.row_count = need_new;
                        changed = true;
                    }
                } else {
                    let details = describe_table_inner(db, &parent)
                        .or_else(|_| describe_table_inner(db, rt))?;
                    let mut columns = default_columns_from_details(&details);
                    // Qualify FK refs on the new parent using its table name.
                    for c in &mut columns {
                        if let Some(ref_t) = c.ref_table.as_mut() {
                            if !ref_t.contains('.') {
                                *ref_t = resolve_ref_table(&parent, ref_t);
                            }
                        }
                    }
                    log.push(format!(
                        "auto-added {parent} ({need_new} rows) for unique FK {child}.{}",
                        col.name
                    ));
                    plan.tables.push(FakeTableSpec {
                        table: parent.clone(),
                        row_count: need_new,
                        columns,
                    });
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
    Ok(())
}

fn preview_table_inner(
    db: &mut LiveDb,
    table: &str,
    limit: u32,
    offset: u32,
    filters: &[TableFilter],
    sort: Option<&TableSort>,
) -> Result<QueryResult, String> {
    match db {
        LiveDb::Sqlite(c) => sqlite::preview_table(c, table, limit, offset, filters, sort),
        LiveDb::Postgres(c) => {
            block_on(postgres::preview_table(c, table, limit, offset, filters, sort))
        }
        LiveDb::Mysql(c) => block_on(mysql::preview_table(c, table, limit, offset, filters, sort)),
        LiveDb::Mssql(c) => block_on(mssql::preview_table(c, table, limit, offset, filters, sort)),
    }
}

fn run_sql_inner(db: &mut LiveDb, sql: &str) -> Result<QueryResult, String> {
    match db {
        LiveDb::Sqlite(c) => sqlite::run_sql(c, sql),
        LiveDb::Postgres(c) => block_on(postgres::run_sql(c, sql)),
        LiveDb::Mysql(c) => block_on(mysql::run_sql(c, sql)),
        LiveDb::Mssql(c) => block_on(mssql::run_sql(c, sql)),
    }
}

fn fetch_all_inner(
    db: &mut LiveDb,
    table: &str,
    filters: &[TableFilter],
    sort: Option<&TableSort>,
) -> Result<QueryResult, String> {
    let mut offset = 0u32;
    let mut columns = Vec::new();
    let mut rows = Vec::new();
    loop {
        let page = preview_table_inner(db, table, EXPORT_CHUNK, offset, filters, sort)?;
        if columns.is_empty() {
            columns = page.columns;
        }
        let n = page.rows.len();
        rows.extend(page.rows);
        if rows.len() >= EXPORT_ROW_CAP {
            rows.truncate(EXPORT_ROW_CAP);
            break;
        }
        if n < EXPORT_CHUNK as usize {
            break;
        }
        offset += EXPORT_CHUNK;
    }
    Ok(QueryResult {
        columns,
        rows,
        rows_affected: None,
    })
}

fn open_engine(engine: &str, config: &ConnectionConfig) -> Result<LiveDb, String> {
    match engine {
        "sqlite" => Ok(LiveDb::Sqlite(sqlite::open(config)?)),
        "postgres" => Ok(LiveDb::Postgres(block_on(postgres::open(config))?)),
        "mysql" | "mariadb" => Ok(LiveDb::Mysql(block_on(mysql::open(config))?)),
        "mssql" => Ok(LiveDb::Mssql(block_on(mssql::connect(config))?)),
        other => Err(format!("unsupported engine: {other}")),
    }
}

pub fn test_engine(engine: &str, config: &ConnectionConfig) -> Result<String, String> {
    let (config, _tunnel) = maybe_tunnel(engine, config)?;
    let config = &config;
    match engine {
        "sqlite" => sqlite::test(config),
        "postgres" => block_on(postgres::test(config)),
        "mysql" | "mariadb" => block_on(mysql::test(config)),
        "mssql" => block_on(mssql::test(config)),
        other => Err(format!("unsupported engine: {other}")),
    }
}

fn block_on<T>(fut: impl std::future::Future<Output = T>) -> T {
    tauri::async_runtime::block_on(fut)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::permissions::Permissions;
    use crate::db::app_store::SavedConnection;

    fn fake_conn(engine: &str, config: ConnectionConfig, perms: Permissions) -> SavedConnection {
        SavedConnection {
            id: "test".into(),
            name: "test".into(),
            engine: engine.into(),
            category_id: None,
            category_name: None,
            is_favorite: false,
            accent_color: "#2563eb".into(),
            config,
            permissions: perms,
        }
    }

    #[test]
    fn sqlite_csv_sql_roundtrip_and_perm_deny() {
        let dir = std::env::temp_dir().join(format!("re-dbviewer-io-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.sqlite");
        {
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
                 INSERT INTO users VALUES (1, 'ada@example.com');",
            )
            .unwrap();
        }

        let session = SessionState::new();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions::default(),
            ))
            .unwrap();

        let csv = session.export_table_csv("users", &[], None).unwrap();
        assert!(csv.contains("email"));
        assert!(csv.contains("ada@example.com"));

        let ddl = session.export_table_sql("users", true, true, &[], None).unwrap();
        assert!(ddl.to_uppercase().contains("CREATE TABLE"));
        assert!(ddl.contains("INSERT INTO"));

        let n = session
            .import_table_csv(
                "users",
                "id,email\n2,grace@example.com\n",
                "append",
            )
            .unwrap();
        assert_eq!(n, 1);

        let preview = session.preview_table("users", 10, 0, &[], None).unwrap();
        assert_eq!(preview.rows.len(), 2);

        session.close().unwrap();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions {
                    allow_insert: false,
                    ..Permissions::default()
                },
            ))
            .unwrap();
        let err = session
            .import_table_csv("users", "id,email\n3,x@y.com\n", "append")
            .unwrap_err();
        assert!(err.to_lowercase().contains("insert"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sqlite_fake_data_inserts_with_fk_order() {
        use crate::db::fake_data::{FakeColumnSpec, FakeDataPlan, FakeTableSpec, FakeWriteMode};

        let dir = std::env::temp_dir().join(format!("re-dbviewer-fake-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("f.sqlite");
        {
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
                 CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), total INTEGER);",
            )
            .unwrap();
        }
        let session = SessionState::new();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions::default(),
            ))
            .unwrap();

        let plan = FakeDataPlan {
            mode: FakeWriteMode::Append,
            seed: Some(42),
            tables: vec![
                FakeTableSpec {
                    table: "orders".into(),
                    row_count: 3,
                    columns: vec![
                        FakeColumnSpec {
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
                        },
                        FakeColumnSpec {
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
                        },
                        FakeColumnSpec {
                            name: "total".into(),
                            kind: "int".into(),
                            value: None,
                            min: Some(10.0),
                            max: Some(99.0),
                            len: None,
                            values: None,
                            ref_table: None,
                            ref_column: None,
                            start: None,
                            step: None,
                            data_type: None,
                            unique: false,
                        },
                    ],
                },
                FakeTableSpec {
                    table: "users".into(),
                    row_count: 2,
                    columns: vec![
                        FakeColumnSpec {
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
                        },
                        FakeColumnSpec {
                            name: "email".into(),
                            kind: "email".into(),
                            value: None,
                            min: None,
                            max: None,
                            len: None,
                            values: None,
                            ref_table: None,
                            ref_column: None,
                            start: None,
                            step: None,
                            data_type: None,
                            unique: false,
                        },
                    ],
                },
            ],
        };
        let res = session.generate_fake_data_on(None, plan).unwrap();
        assert_eq!(res.rows, 5);
        let preview = session.preview_table("orders", 10, 0, &[], None).unwrap();
        assert_eq!(preview.rows.len(), 3);
        session.close().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sqlite_fake_data_auto_adds_parent_for_unique_fk() {
        use crate::db::fake_data::{FakeColumnSpec, FakeDataPlan, FakeTableSpec, FakeWriteMode};

        let dir = std::env::temp_dir().join(format!("re-dbviewer-fake-auto-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("f.sqlite");
        {
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch(
                "CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name TEXT);
                 CREATE TABLE accounts (
                   id INTEGER PRIMARY KEY,
                   supplier_id INTEGER NOT NULL UNIQUE REFERENCES suppliers(id)
                 );
                 INSERT INTO suppliers (id, name) VALUES (1, 's');
                 INSERT INTO accounts (id, supplier_id) VALUES (1, 1);",
            )
            .unwrap();
        }
        let session = SessionState::new();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions::default(),
            ))
            .unwrap();

        // Only accounts — suppliers already fully used; factory should auto-add suppliers.
        let plan = FakeDataPlan {
            mode: FakeWriteMode::Append,
            seed: Some(1),
            tables: vec![FakeTableSpec {
                table: "accounts".into(),
                row_count: 3,
                columns: vec![
                    FakeColumnSpec {
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
                        unique: true,
                    },
                    FakeColumnSpec {
                        name: "supplier_id".into(),
                        kind: "fk".into(),
                        value: None,
                        min: None,
                        max: None,
                        len: None,
                        values: None,
                        ref_table: Some("suppliers".into()),
                        ref_column: Some("id".into()),
                        start: None,
                        step: None,
                        data_type: None,
                        unique: true,
                    },
                ],
            }],
        };
        let res = session.generate_fake_data_on(None, plan).unwrap();
        assert!(res.log.iter().any(|l| l.contains("auto-added suppliers")));
        assert_eq!(res.rows, 6); // 3 suppliers + 3 accounts
        session.close().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sqlite_fake_data_unique_fk_no_reuse() {
        use crate::db::fake_data::{FakeColumnSpec, FakeDataPlan, FakeTableSpec, FakeWriteMode};

        let dir = std::env::temp_dir().join(format!("re-dbviewer-fake-ufk-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("f.sqlite");
        {
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch(
                "CREATE TABLE suppliers (id INTEGER PRIMARY KEY);
                 CREATE TABLE accounts (
                   id INTEGER PRIMARY KEY,
                   supplier_id INTEGER NOT NULL UNIQUE REFERENCES suppliers(id)
                 );
                 INSERT INTO suppliers (id) VALUES (1),(2),(3),(4),(5);
                 INSERT INTO accounts (id, supplier_id) VALUES (1, 1);",
            )
            .unwrap();
        }
        let session = SessionState::new();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions::default(),
            ))
            .unwrap();

        let plan = FakeDataPlan {
            mode: FakeWriteMode::Append,
            seed: Some(1),
            tables: vec![FakeTableSpec {
                table: "accounts".into(),
                row_count: 3,
                columns: vec![
                    FakeColumnSpec {
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
                        unique: true,
                    },
                    FakeColumnSpec {
                        name: "supplier_id".into(),
                        kind: "fk".into(),
                        value: None,
                        min: None,
                        max: None,
                        len: None,
                        values: None,
                        ref_table: Some("suppliers".into()),
                        ref_column: Some("id".into()),
                        start: None,
                        step: None,
                        data_type: None,
                        unique: true,
                    },
                ],
            }],
        };
        let res = session.generate_fake_data_on(None, plan).unwrap();
        assert_eq!(res.rows, 3);
        let preview = session.preview_table("accounts", 10, 0, &[], None).unwrap();
        assert_eq!(preview.rows.len(), 4);
        let sids: Vec<_> = preview
            .rows
            .iter()
            .map(|r| r[1].to_string())
            .collect();
        let set: std::collections::HashSet<_> = sids.iter().cloned().collect();
        assert_eq!(set.len(), sids.len(), "supplier_id must stay unique: {sids:?}");
        session.close().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sqlite_fake_data_fk_uses_existing_parent_rows() {
        use crate::db::fake_data::{FakeColumnSpec, FakeDataPlan, FakeTableSpec, FakeWriteMode};

        let dir = std::env::temp_dir().join(format!("re-dbviewer-fake-fk-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("f.sqlite");
        {
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
                 CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id));
                 INSERT INTO users (id, email) VALUES (7, 'a@b.c'), (8, 'd@e.f');",
            )
            .unwrap();
        }
        let session = SessionState::new();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions::default(),
            ))
            .unwrap();

        // Only orders in the plan — user_id FK should sample existing users.
        let plan = FakeDataPlan {
            mode: FakeWriteMode::Append,
            seed: Some(1),
            tables: vec![FakeTableSpec {
                table: "orders".into(),
                row_count: 3,
                columns: vec![
                    FakeColumnSpec {
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
                    },
                    FakeColumnSpec {
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
                    },
                ],
            }],
        };
        let res = session.generate_fake_data_on(None, plan).unwrap();
        assert_eq!(res.rows, 3);
        assert!(res.log.iter().any(|l| l.contains("existing users.id")));
        let preview = session.preview_table("orders", 10, 0, &[], None).unwrap();
        assert_eq!(preview.rows.len(), 3);
        session.close().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sqlite_fake_data_append_bumps_pk_sequence() {
        use crate::db::fake_data::{FakeColumnSpec, FakeDataPlan, FakeTableSpec, FakeWriteMode};

        let dir = std::env::temp_dir().join(format!("re-dbviewer-fake-bump-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("f.sqlite");
        {
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
                 INSERT INTO users (id, email) VALUES (100, 'a@b.c');",
            )
            .unwrap();
        }
        let session = SessionState::new();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions::default(),
            ))
            .unwrap();

        let plan = FakeDataPlan {
            mode: FakeWriteMode::Append,
            seed: Some(1),
            tables: vec![FakeTableSpec {
                table: "users".into(),
                row_count: 2,
                columns: vec![
                    FakeColumnSpec {
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
                    },
                    FakeColumnSpec {
                        name: "email".into(),
                        kind: "email".into(),
                        value: None,
                        min: None,
                        max: None,
                        len: None,
                        values: None,
                        ref_table: None,
                        ref_column: None,
                        start: None,
                        step: None,
                        data_type: None,
                        unique: false,
                    },
                ],
            }],
        };
        let res = session.generate_fake_data_on(None, plan).unwrap();
        assert_eq!(res.rows, 2);
        assert!(res.log.iter().any(|l| l.contains("sequence start → 101")));
        let preview = session.preview_table("users", 10, 0, &[], None).unwrap();
        assert_eq!(preview.rows.len(), 3);
        session.close().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn fake_col(name: &str, kind: &str) -> crate::db::fake_data::FakeColumnSpec {
        crate::db::fake_data::FakeColumnSpec {
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

    #[test]
    fn sqlite_fake_data_truncate_fill_clears_and_refills() {
        use crate::db::fake_data::{FakeDataPlan, FakeTableSpec, FakeWriteMode};

        let dir = std::env::temp_dir().join(format!("re-dbviewer-fake-trunc-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("f.sqlite");
        {
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch(
                "CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT);
                 INSERT INTO items VALUES (1,'a'),(2,'b'),(3,'c');",
            )
            .unwrap();
        }
        let session = SessionState::new();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions::default(),
            ))
            .unwrap();

        let plan = FakeDataPlan {
            mode: FakeWriteMode::TruncateFill,
            seed: Some(1),
            tables: vec![FakeTableSpec {
                table: "items".into(),
                row_count: 2,
                columns: vec![
                    {
                        let mut c = fake_col("id", "sequence");
                        c.unique = true;
                        c
                    },
                    fake_col("label", "string"),
                ],
            }],
        };
        let res = session.generate_fake_data_on(None, plan).unwrap();
        assert!(res.log.iter().any(|l| l.contains("cleared")));
        assert_eq!(res.rows, 2);
        let preview = session.preview_table("items", 10, 0, &[], None).unwrap();
        assert_eq!(preview.rows.len(), 2);
        session.close().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sqlite_fake_data_auto_bumps_parent_row_count() {
        use crate::db::fake_data::{FakeDataPlan, FakeTableSpec, FakeWriteMode};

        let dir = std::env::temp_dir().join(format!("re-dbviewer-fake-bump-p-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("f.sqlite");
        {
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch(
                "CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name TEXT);
                 CREATE TABLE accounts (
                   id INTEGER PRIMARY KEY,
                   supplier_id INTEGER NOT NULL UNIQUE REFERENCES suppliers(id)
                 );",
            )
            .unwrap();
        }
        let session = SessionState::new();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions::default(),
            ))
            .unwrap();

        let mut supplier_id = fake_col("supplier_id", "fk");
        supplier_id.ref_table = Some("suppliers".into());
        supplier_id.ref_column = Some("id".into());
        supplier_id.unique = true;

        let plan = FakeDataPlan {
            mode: FakeWriteMode::Append,
            seed: Some(1),
            tables: vec![
                FakeTableSpec {
                    table: "suppliers".into(),
                    row_count: 1, // too few for 3 unique accounts
                    columns: vec![
                        {
                            let mut c = fake_col("id", "sequence");
                            c.unique = true;
                            c
                        },
                        fake_col("name", "string"),
                    ],
                },
                FakeTableSpec {
                    table: "accounts".into(),
                    row_count: 3,
                    columns: vec![
                        {
                            let mut c = fake_col("id", "sequence");
                            c.unique = true;
                            c
                        },
                        supplier_id,
                    ],
                },
            ],
        };
        let res = session.generate_fake_data_on(None, plan).unwrap();
        assert!(
            res.log.iter().any(|l| l.contains("auto-bumped suppliers")),
            "log={:?}",
            res.log
        );
        assert!(res.rows >= 6); // 3 suppliers + 3 accounts
        session.close().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sqlite_fake_data_batching_over_200_rows() {
        use crate::db::fake_data::{FakeDataPlan, FakeTableSpec, FakeWriteMode};

        let dir = std::env::temp_dir().join(format!("re-dbviewer-fake-batch-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("f.sqlite");
        {
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch("CREATE TABLE nums (id INTEGER PRIMARY KEY);")
                .unwrap();
        }
        let session = SessionState::new();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions::default(),
            ))
            .unwrap();

        let plan = FakeDataPlan {
            mode: FakeWriteMode::Append,
            seed: Some(1),
            tables: vec![FakeTableSpec {
                table: "nums".into(),
                row_count: 250,
                columns: vec![{
                    let mut c = fake_col("id", "sequence");
                    c.unique = true;
                    c
                }],
            }],
        };
        let res = session.generate_fake_data_on(None, plan).unwrap();
        assert_eq!(res.rows, 250);
        session.close().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sqlite_fake_data_topo_cycle_surfaces_error() {
        use crate::db::fake_data::{FakeDataPlan, FakeTableSpec, FakeWriteMode};

        let dir = std::env::temp_dir().join(format!("re-dbviewer-fake-cycle-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("f.sqlite");
        {
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch(
                "CREATE TABLE a (id INTEGER PRIMARY KEY, b_id INTEGER);
                 CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER);",
            )
            .unwrap();
        }
        let session = SessionState::new();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions::default(),
            ))
            .unwrap();

        let mut a_fk = fake_col("b_id", "fk");
        a_fk.ref_table = Some("b".into());
        a_fk.ref_column = Some("id".into());
        let mut b_fk = fake_col("a_id", "fk");
        b_fk.ref_table = Some("a".into());
        b_fk.ref_column = Some("id".into());

        let plan = FakeDataPlan {
            mode: FakeWriteMode::Append,
            seed: None,
            tables: vec![
                FakeTableSpec {
                    table: "a".into(),
                    row_count: 1,
                    columns: vec![fake_col("id", "sequence"), a_fk],
                },
                FakeTableSpec {
                    table: "b".into(),
                    row_count: 1,
                    columns: vec![fake_col("id", "sequence"), b_fk],
                },
            ],
        };
        let err = session.generate_fake_data_on(None, plan).unwrap_err();
        assert!(err.contains("circular"), "{err}");
        session.close().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sqlite_fake_data_rejects_without_insert_permission() {
        use crate::db::fake_data::{FakeDataPlan, FakeTableSpec, FakeWriteMode};

        let dir = std::env::temp_dir().join(format!("re-dbviewer-fake-noperm-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("f.sqlite");
        {
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch("CREATE TABLE t (id INTEGER PRIMARY KEY);")
                .unwrap();
        }
        let session = SessionState::new();
        session
            .open(fake_conn(
                "sqlite",
                ConnectionConfig::sqlite_path(path.to_string_lossy()),
                Permissions {
                    allow_insert: false,
                    ..Permissions::default()
                },
            ))
            .unwrap();

        let plan = FakeDataPlan {
            mode: FakeWriteMode::Append,
            seed: None,
            tables: vec![FakeTableSpec {
                table: "t".into(),
                row_count: 1,
                columns: vec![fake_col("id", "sequence")],
            }],
        };
        let err = session.generate_fake_data_on(None, plan).unwrap_err();
        assert!(err.to_lowercase().contains("insert"), "{err}");
        session.close().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn multi_session_active_and_scoped() {
        let dir = std::env::temp_dir().join(format!("re-dbviewer-multi-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mk = |name: &str, table: &str| {
            let path = dir.join(name);
            let c = rusqlite::Connection::open(&path).unwrap();
            c.execute_batch(&format!("CREATE TABLE {table} (id INTEGER);")).unwrap();
            let mut sc = fake_conn("sqlite", ConnectionConfig::sqlite_path(path.to_string_lossy()), Permissions::default());
            sc.id = name.into();
            sc
        };
        let session = SessionState::new();
        session.open(mk("a.sqlite", "ta")).unwrap();
        session.open(mk("b.sqlite", "tb")).unwrap();
        assert_eq!(session.open_ids().len(), 2);
        // b opened last => active
        let names = |id: Option<&str>| -> Vec<String> {
            session.list_schema_on(id).unwrap().iter().flat_map(|s| s.children.iter().map(|c| c.name.clone()).chain(std::iter::once(s.name.clone()))).collect()
        };
        assert!(names(None).iter().any(|n| n == "tb"));
        assert!(names(Some("a.sqlite")).iter().any(|n| n == "ta"));
        session.set_active("a.sqlite").unwrap();
        assert!(names(None).iter().any(|n| n == "ta"));
        session.close_id(Some("a.sqlite")).unwrap();
        // active falls back to remaining
        assert!(names(None).iter().any(|n| n == "tb"));
        assert!(session.set_active("a.sqlite").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn mysql_export_import_smoke() {
        let session = SessionState::new();
        let opened = session.open(fake_conn(
            "mysql",
            ConnectionConfig {
                host: Some("127.0.0.1".into()),
                port: Some(3306),
                user: Some("root".into()),
                password: Some("redev".into()),
                database: Some("re_dbviewer".into()),
                ..Default::default()
            },
            Permissions::default(),
        ));
        if let Err(e) = opened {
            eprintln!("skip mysql smoke: {e}");
            return;
        }

        let csv = session.export_table_csv("users", &[], None).unwrap();
        assert!(csv.contains("email"));

        let sql = session.export_table_sql("users", true, true, &[], None).unwrap();
        assert!(sql.to_uppercase().contains("CREATE TABLE"));
        assert!(sql.contains("INSERT INTO"));

        // append a disposable row then replace back? keep seed intact: append unique email
        let n = session
            .import_table_csv(
                "users",
                "email,name\nio_smoke@example.com,IO Smoke\n",
                "append",
            )
            .unwrap();
        assert_eq!(n, 1);

        session
            .run_sql_script_on(None, "DELETE FROM users WHERE email = 'io_smoke@example.com'")
            .unwrap();

        session
            .open(fake_conn(
                "mysql",
                ConnectionConfig {
                    host: Some("127.0.0.1".into()),
                    port: Some(3306),
                    user: Some("root".into()),
                    password: Some("redev".into()),
                    database: Some("re_dbviewer".into()),
                    ..Default::default()
                },
                Permissions {
                    allow_insert: false,
                    ..Permissions::default()
                },
            ))
            .unwrap();
        // re-open overwrites — need close first? open replaces
        let err = session
            .import_table_csv(
                "users",
                "email,name\nblocked@example.com,Nope\n",
                "append",
            )
            .unwrap_err();
        assert!(err.to_lowercase().contains("insert"));
    }
}
