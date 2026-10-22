mod db;
mod diagnostics;

use db::{
    fake_data::{FakeDataPlan, FakeDataResult},
    keyring_store,
    vault::{self, VaultStatus},
    test_engine, AppStore, Category, ConnectionConfig, Permissions, QueryResult, SavedConnection,
    SchemaNode, SessionState, TableDetails, TableFilter, TableSort,
};
use std::sync::Mutex;
use tauri::{Manager, State};

struct AppState {
    store: Mutex<AppStore>,
    session: SessionState,
}

/// Fill `config.password` from keyring or unlocked vault.
fn hydrate(mut c: SavedConnection) -> SavedConnection {
    let empty = c.config.password.as_deref().unwrap_or("").is_empty();
    if !empty {
        // Legacy plaintext still in SQLite — expose for this session; migrate on save.
        return c;
    }
    if c.config.password_in_keyring {
        if let Some(pw) = keyring_store::get(&c.id) {
            c.config.password = Some(pw);
            return c;
        }
    }
    if c.config.password_in_vault {
        let id = c.id.clone();
        if let Ok(Ok(Some(pw))) = vault::with_vault(|v| {
            if !v.is_unlocked() {
                return Ok(None);
            }
            v.get(&id)
        }) {
            c.config.password = Some(pw);
        }
    }
    c
}

/// Persist password to OS keyring, else encrypted vault. Never keeps plaintext in config_json.
fn secure_config(id: &str, mut config: ConnectionConfig) -> Result<ConnectionConfig, String> {
    let store = config.store_password;
    let pw = config.password.clone().unwrap_or_default();

    if !store {
        keyring_store::delete(id);
        let _ = vault::with_vault(|v| {
            if v.is_unlocked() {
                let _ = v.delete(id);
            }
        });
        config.password = None;
        config.password_in_keyring = false;
        config.password_in_vault = false;
        config.store_password = false;
        return Ok(config);
    }

    if pw.is_empty() {
        config.password = None;
        return Ok(config);
    }

    if keyring_store::set(id, &pw).is_ok() {
        let _ = vault::with_vault(|v| {
            if v.is_unlocked() {
                let _ = v.delete(id);
            }
        });
        config.password = None;
        config.password_in_keyring = true;
        config.password_in_vault = false;
        config.store_password = true;
        return Ok(config);
    }

    vault::with_vault(|v| {
        if !v.is_unlocked() {
            return Err(
                "OS keyring unavailable and vault is locked. Unlock the vault (or create one) to store the password securely."
                    .into(),
            );
        }
        v.set(id, &pw)
    })??;

    keyring_store::delete(id);
    config.password = None;
    config.password_in_keyring = false;
    config.password_in_vault = true;
    config.store_password = true;
    Ok(config)
}

/// Persist config with secrets stripped; migrate legacy plaintext into keyring/vault.
fn persist_secured(
    store: &AppStore,
    id: &str,
    name: &str,
    engine: &str,
    category_id: Option<&str>,
    is_favorite: bool,
    accent: &str,
    config: ConnectionConfig,
    permissions: &Permissions,
) -> Result<ConnectionConfig, String> {
    let secured = secure_config(id, config)?;
    store.update(
        id,
        name,
        engine,
        category_id,
        is_favorite,
        accent,
        &secured,
        permissions,
    )?;
    Ok(secured)
}

/// Migrate legacy plaintext passwords out of SQLite into keyring/vault when possible.
fn migrate_legacy_plaintext(
    store: &AppStore,
    mut c: SavedConnection,
) -> SavedConnection {
    let has_pw = !c.config.password.as_deref().unwrap_or("").is_empty();
    let flagged = c.config.password_in_keyring || c.config.password_in_vault;
    if !has_pw || flagged {
        return c;
    }
    c.config.store_password = true;
    match persist_secured(
        store,
        &c.id,
        &c.name,
        &c.engine,
        c.category_id.as_deref(),
        c.is_favorite,
        &c.accent_color,
        c.config.clone(),
        &c.permissions,
    ) {
        Ok(secured) => {
            c.config = secured;
            hydrate(c)
        }
        Err(_) => c,
    }
}

#[tauri::command]
fn list_connections(state: State<'_, AppState>) -> Result<Vec<SavedConnection>, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let list = store.list()?;
    Ok(list
        .into_iter()
        .map(|c| migrate_legacy_plaintext(&store, c))
        .map(hydrate)
        .collect())
}

#[tauri::command]
fn list_categories(state: State<'_, AppState>) -> Result<Vec<Category>, String> {
    state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .list_categories()
}

#[tauri::command]
fn save_category(state: State<'_, AppState>, name: String) -> Result<Category, String> {
    state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .save_category(&name)
}

#[tauri::command]
fn rename_category(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<(), String> {
    state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .rename_category(&id, &name)
}

#[tauri::command]
fn delete_category(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .delete_category(&id)
}

#[tauri::command]
fn save_connection(
    state: State<'_, AppState>,
    name: String,
    engine: String,
    category_id: Option<String>,
    is_favorite: bool,
    accent_color: Option<String>,
    config: ConnectionConfig,
    permissions: Permissions,
) -> Result<SavedConnection, String> {
    let accent = accent_color.as_deref().unwrap_or("#2563eb");
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let mut saved = store.save(
        &name,
        &engine,
        category_id.as_deref(),
        is_favorite,
        accent,
        &ConnectionConfig {
            password: None,
            password_in_keyring: false,
            password_in_vault: false,
            ..config.clone()
        },
        &permissions,
    )?;
    let secured = persist_secured(
        &store,
        &saved.id,
        &name,
        &engine,
        category_id.as_deref(),
        is_favorite,
        accent,
        config.clone(),
        &permissions,
    )?;
    saved.config = secured;
    // Return hydrated password for immediate connect UX when store=true.
    Ok(hydrate(saved))
}

#[tauri::command]
fn duplicate_connection(state: State<'_, AppState>, id: String) -> Result<SavedConnection, String> {
    let src = {
        let store = state.store.lock().map_err(|e| e.to_string())?;
        hydrate(store.get(&id)?)
    };
    save_connection(
        state,
        format!("{} (copy)", src.name),
        src.engine.clone(),
        src.category_id.clone(),
        false,
        Some(src.accent_color.clone()),
        src.config.clone(),
        src.permissions.clone(),
    )
}

#[tauri::command]
fn update_connection(
    state: State<'_, AppState>,
    id: String,
    name: String,
    engine: String,
    category_id: Option<String>,
    is_favorite: bool,
    accent_color: Option<String>,
    config: ConnectionConfig,
    permissions: Permissions,
) -> Result<(), String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    // Preserve storage flags when password field left blank and store remains on.
    let mut cfg = config;
    if cfg.store_password
        && cfg.password.as_deref().unwrap_or("").is_empty()
    {
        let existing = store.get(&id)?;
        cfg.password_in_keyring = existing.config.password_in_keyring;
        cfg.password_in_vault = existing.config.password_in_vault;
    }
    persist_secured(
        &store,
        &id,
        &name,
        &engine,
        category_id.as_deref(),
        is_favorite,
        accent_color.as_deref().unwrap_or("#2563eb"),
        cfg,
        &permissions,
    )?;
    Ok(())
}

#[tauri::command]
fn set_favorite(
    state: State<'_, AppState>,
    id: String,
    is_favorite: bool,
) -> Result<(), String> {
    state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .set_favorite(&id, is_favorite)
}

#[tauri::command]
fn delete_connection(state: State<'_, AppState>, id: String) -> Result<(), String> {
    keyring_store::delete(&id);
    let _ = vault::with_vault(|v| {
        if v.is_unlocked() {
            let _ = v.delete(&id);
        }
    });
    let _ = state.session.close_id(Some(&id));
    state.store.lock().map_err(|e| e.to_string())?.delete(&id)
}

#[tauri::command]
fn clear_connection_password(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let mut conn = store.get(&id)?;
    keyring_store::delete(&id);
    if conn.config.password_in_vault {
        vault::with_vault(|v| {
            if !v.is_unlocked() {
                return Err(
                    "Password is in the app vault but the vault is locked. Unlock the vault first."
                        .into(),
                );
            }
            v.delete(&id)
        })??;
    }
    conn.config.password = None;
    conn.config.password_in_keyring = false;
    conn.config.password_in_vault = false;
    conn.config.store_password = false;
    store.update(
        &id,
        &conn.name,
        &conn.engine,
        conn.category_id.as_deref(),
        conn.is_favorite,
        &conn.accent_color,
        &conn.config,
        &conn.permissions,
    )
}

#[tauri::command]
fn vault_status() -> Result<VaultStatus, String> {
    let keyring_available = keyring_store::available();
    vault::with_vault(|v| v.status(keyring_available))
}

#[tauri::command]
fn vault_unlock(master_password: String) -> Result<VaultStatus, String> {
    vault::with_vault(|v| {
        v.unlock_or_create(&master_password)?;
        Ok(v.status(keyring_store::available()))
    })?
}

#[tauri::command]
fn vault_lock() -> Result<VaultStatus, String> {
    vault::with_vault(|v| {
        v.lock();
        Ok(v.status(keyring_store::available()))
    })?
}

#[tauri::command]
fn test_connection(engine: String, config: ConnectionConfig) -> Result<String, String> {
    match test_engine(&engine, &config) {
        Ok(msg) => Ok(msg),
        Err(e) => {
            log::error!("test_connection failed engine={engine}");
            Err(e)
        }
    }
}

#[tauri::command]
fn open_connection(state: State<'_, AppState>, id: String) -> Result<SavedConnection, String> {
    let conn = hydrate(state.store.lock().map_err(|e| e.to_string())?.get(&id)?);
    if conn.config.password_in_vault
        && conn.config.password.as_deref().unwrap_or("").is_empty()
    {
        return Err(
            "Password is in the app vault but the vault is locked. Unlock the vault first."
                .into(),
        );
    }
    let engine = conn.engine.clone();
    match state.session.open(conn.clone()) {
        Ok(()) => Ok(conn),
        Err(e) => {
            log::error!("open_connection failed engine={engine}");
            Err(e)
        }
    }
}

/// Closes `connection_id`, or the active connection when omitted.
#[tauri::command]
fn close_connection(
    state: State<'_, AppState>,
    connection_id: Option<String>,
) -> Result<(), String> {
    state.session.close_id(connection_id.as_deref())
}

#[tauri::command]
fn set_active_connection(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.session.set_active(&id)
}

#[tauri::command]
fn list_open_connections(state: State<'_, AppState>) -> Vec<String> {
    state.session.open_ids()
}

#[tauri::command]
fn list_schema(
    state: State<'_, AppState>,
    connection_id: Option<String>,
) -> Result<Vec<SchemaNode>, String> {
    state.session.list_schema_on(connection_id.as_deref())
}

#[tauri::command]
fn describe_table(
    state: State<'_, AppState>,
    table: String,
    connection_id: Option<String>,
) -> Result<TableDetails, String> {
    state
        .session
        .describe_table_on(connection_id.as_deref(), &table)
}

#[tauri::command]
fn preview_table(
    state: State<'_, AppState>,
    table: String,
    limit: Option<u32>,
    offset: Option<u32>,
    filters: Option<Vec<TableFilter>>,
    sort: Option<TableSort>,
) -> Result<QueryResult, String> {
    let filters = filters.unwrap_or_default();
    state.session.preview_table(
        &table,
        limit.unwrap_or(100),
        offset.unwrap_or(0),
        &filters,
        sort.as_ref(),
    )
}

#[tauri::command]
fn run_sql(
    state: State<'_, AppState>,
    sql: String,
    connection_id: Option<String>,
) -> Result<QueryResult, String> {
    state.session.run_sql_on(connection_id.as_deref(), &sql)
}

#[tauri::command]
fn generate_fake_data(
    state: State<'_, AppState>,
    plan: FakeDataPlan,
    connection_id: Option<String>,
) -> Result<FakeDataResult, String> {
    state
        .session
        .generate_fake_data_on(connection_id.as_deref(), plan)
}

#[tauri::command]
fn export_table_csv(
    state: State<'_, AppState>,
    table: String,
    filters: Option<Vec<TableFilter>>,
    sort: Option<TableSort>,
) -> Result<String, String> {
    let filters = filters.unwrap_or_default();
    state
        .session
        .export_table_csv(&table, &filters, sort.as_ref())
}

#[tauri::command]
fn export_table_sql(
    state: State<'_, AppState>,
    table: String,
    include_schema: bool,
    include_data: bool,
    filters: Option<Vec<TableFilter>>,
    sort: Option<TableSort>,
    connection_id: Option<String>,
) -> Result<String, String> {
    let filters = filters.unwrap_or_default();
    state.session.export_table_sql_on(
        connection_id.as_deref(),
        &table,
        include_schema,
        include_data,
        &filters,
        sort.as_ref(),
    )
}

#[tauri::command]
fn write_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_clipboard() -> Result<String, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.get_text().map_err(|e| e.to_string())
}

#[tauri::command]
fn import_table_csv(
    state: State<'_, AppState>,
    table: String,
    csv: String,
    mode: String,
) -> Result<u64, String> {
    state.session.import_table_csv(&table, &csv, &mode)
}

#[tauri::command]
fn run_sql_script(
    state: State<'_, AppState>,
    sql: String,
    connection_id: Option<String>,
) -> Result<u64, String> {
    state
        .session
        .run_sql_script_on(connection_id.as_deref(), &sql)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 50 * 1024 * 1024 {
        return Err("file exceeds 50MB limit".into());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn append_log(level: String, message: String) -> Result<(), String> {
    diagnostics::append(&level, &message)
}

#[tauri::command]
fn read_diagnostics() -> Result<String, String> {
    diagnostics::read_bundle()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            if let Err(e) = diagnostics::init(&data_dir) {
                eprintln!("diagnostics init failed: {e}");
            }
            vault::init(data_dir.join("password-vault.json"));
            let store = match AppStore::open(data_dir) {
                Ok(s) => s,
                Err(e) => {
                    log::error!("app store open failed");
                    return Err(e.into());
                }
            };
            app.manage(AppState {
                store: Mutex::new(store),
                session: SessionState::new(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_connections,
            list_categories,
            save_category,
            rename_category,
            delete_category,
            save_connection,
            update_connection,
            set_favorite,
            delete_connection,
            clear_connection_password,
            vault_status,
            vault_unlock,
            vault_lock,
            test_connection,
            duplicate_connection,
            open_connection,
            close_connection,
            set_active_connection,
            list_open_connections,
            list_schema,
            describe_table,
            preview_table,
            run_sql,
            generate_fake_data,
            export_table_csv,
            export_table_sql,
            import_table_csv,
            run_sql_script,
            read_text_file,
            write_text_file,
            write_clipboard,
            read_clipboard,
            append_log,
            read_diagnostics
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
