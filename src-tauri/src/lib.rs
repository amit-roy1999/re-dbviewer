mod db;

use db::{
    keyring_store, test_engine, AppStore, Category, ConnectionConfig, Permissions, QueryResult, SavedConnection,
    SchemaNode, SessionState, TableDetails, TableFilter, TableSort,
};
use std::sync::Mutex;
use tauri::{Manager, State};

struct AppState {
    store: Mutex<AppStore>,
    session: SessionState,
}

/// Fill `config.password` from the OS keyring when the saved row says it lives there.
fn hydrate(mut c: SavedConnection) -> SavedConnection {
    if c.config.password_in_keyring && c.config.password.as_deref().unwrap_or("").is_empty() {
        c.config.password = keyring_store::get(&c.id);
    }
    c
}

/// Move the password into the keyring. Returns the config to persist:
/// password stripped + flag set on success; unchanged (plaintext fallback) when no keyring.
fn secure_config(id: &str, mut config: ConnectionConfig) -> ConnectionConfig {
    let pw = config.password.clone().unwrap_or_default();
    if pw.is_empty() {
        keyring_store::delete(id);
        config.password_in_keyring = false;
        return config;
    }
    if keyring_store::set(id, &pw).is_ok() {
        config.password = None;
        config.password_in_keyring = true;
    } else {
        config.password_in_keyring = false;
    }
    config
}

#[tauri::command]
fn list_connections(state: State<'_, AppState>) -> Result<Vec<SavedConnection>, String> {
    let list = state.store.lock().map_err(|e| e.to_string())?.list()?;
    Ok(list.into_iter().map(hydrate).collect())
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
            ..config.clone()
        },
        &permissions,
    )?;
    if config.password.as_deref().unwrap_or("").is_empty() {
        return Ok(saved);
    }
    let secured = secure_config(&saved.id, config.clone());
    store.update(
        &saved.id,
        &name,
        &engine,
        category_id.as_deref(),
        is_favorite,
        accent,
        &secured,
        &permissions,
    )?;
    saved.config = config;
    Ok(saved)
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
    let config = secure_config(&id, config);
    state.store.lock().map_err(|e| e.to_string())?.update(
        &id,
        &name,
        &engine,
        category_id.as_deref(),
        is_favorite,
        accent_color.as_deref().unwrap_or("#2563eb"),
        &config,
        &permissions,
    )
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
    let _ = state.session.close_id(Some(&id));
    state.store.lock().map_err(|e| e.to_string())?.delete(&id)
}

#[tauri::command]
fn test_connection(engine: String, config: ConnectionConfig) -> Result<String, String> {
    test_engine(&engine, &config)
}

#[tauri::command]
fn open_connection(state: State<'_, AppState>, id: String) -> Result<SavedConnection, String> {
    let conn = hydrate(state.store.lock().map_err(|e| e.to_string())?.get(&id)?);
    state.session.open(conn.clone())?;
    Ok(conn)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let store = AppStore::open(data_dir)?;
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
            export_table_csv,
            export_table_sql,
            import_table_csv,
            run_sql_script,
            read_text_file,
            write_text_file,
            write_clipboard,
            read_clipboard
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
