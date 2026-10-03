mod db;

use db::{
    test_engine, AppStore, Category, ConnectionConfig, Permissions, QueryResult, SavedConnection,
    SchemaNode, SessionState,
};
use std::sync::Mutex;
use tauri::{Manager, State};

struct AppState {
    store: Mutex<AppStore>,
    session: SessionState,
}

#[tauri::command]
fn list_connections(state: State<'_, AppState>) -> Result<Vec<SavedConnection>, String> {
    state.store.lock().map_err(|e| e.to_string())?.list()
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
    state.store.lock().map_err(|e| e.to_string())?.save(
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
    state.store.lock().map_err(|e| e.to_string())?.delete(&id)
}

#[tauri::command]
fn test_connection(engine: String, config: ConnectionConfig) -> Result<String, String> {
    test_engine(&engine, &config)
}

#[tauri::command]
fn open_connection(state: State<'_, AppState>, id: String) -> Result<SavedConnection, String> {
    let conn = state.store.lock().map_err(|e| e.to_string())?.get(&id)?;
    state.session.open(conn.clone())?;
    Ok(conn)
}

#[tauri::command]
fn close_connection(state: State<'_, AppState>) -> Result<(), String> {
    state.session.close()
}

#[tauri::command]
fn list_schema(state: State<'_, AppState>) -> Result<Vec<SchemaNode>, String> {
    state.session.list_schema()
}

#[tauri::command]
fn preview_table(
    state: State<'_, AppState>,
    table: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<QueryResult, String> {
    state
        .session
        .preview_table(&table, limit.unwrap_or(100), offset.unwrap_or(0))
}

#[tauri::command]
fn run_sql(state: State<'_, AppState>, sql: String) -> Result<QueryResult, String> {
    state.session.run_sql(&sql)
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
            open_connection,
            close_connection,
            list_schema,
            preview_table,
            run_sql
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
