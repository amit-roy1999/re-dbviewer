/** Seeded MySQL connection for Playwright browser-mode E2E. */
export const DEMO_CONNECTION = {
  id: "conn-mysql-1",
  name: "Demo MySQL",
  engine: "mysql",
  categoryId: null,
  categoryName: null,
  isFavorite: false,
  accentColor: "#2563eb",
  config: {
    host: "127.0.0.1",
    port: 3306,
    user: "root",
    database: "demo",
  },
  permissions: {
    allowSelect: true,
    allowInsert: true,
    allowUpdate: true,
    allowDelete: true,
    allowDdl: true,
  },
} as const;

export const DEMO_SCHEMA = [
  {
    name: "demo",
    kind: "schema",
    children: [
      { name: "users", kind: "table", children: [] },
      { name: "orders", kind: "table", children: [] },
    ],
  },
];

export const DEMO_QUERY_RESULT = {
  columns: ["ok"],
  rows: [[1]],
  rowsAffected: null,
};

/**
 * Installs `window.__TAURI_INTERNALS__` so `@tauri-apps/api` invoke works in
 * Chromium without a native Tauri runtime.
 *
 * Must be a serializable function body for `page.addInitScript`.
 */
export function tauriInitScriptSource(): string {
  const conn = JSON.stringify(DEMO_CONNECTION);
  const schema = JSON.stringify(DEMO_SCHEMA);
  const queryResult = JSON.stringify(DEMO_QUERY_RESULT);

  return `(() => {
    const DEMO = ${conn};
    const SCHEMA = ${schema};
    const QUERY = ${queryResult};
    const callbacks = new Map();
    let nextCb = 1;

    function handleInvoke(cmd, args) {
      switch (cmd) {
        case "list_connections":
          return [DEMO];
        case "list_categories":
          return [];
        case "list_open_connections":
          return [DEMO.id];
        case "open_connection":
          return { ...DEMO, id: (args && args.id) || DEMO.id };
        case "close_connection":
        case "set_active_connection":
        case "write_clipboard":
        case "write_text_file":
          return null;
        case "read_clipboard":
          return "";
        case "list_schema":
          return SCHEMA;
        case "describe_table":
          return {
            columns: [
              { name: "id", dataType: "INT", nullable: false, defaultValue: null, isPk: true },
              { name: "name", dataType: "VARCHAR", nullable: true, defaultValue: null, isPk: false },
            ],
            foreignKeys: [],
            indexes: [],
          };
        case "run_sql":
        case "run_sql_script":
          if (cmd === "run_sql_script") return 1;
          return QUERY;
        case "export_table_sql":
          return "CREATE TABLE users (id INT);";
        case "test_connection":
          return "ok";
        default:
          if (typeof cmd === "string" && cmd.startsWith("plugin:")) {
            return null;
          }
          console.warn("[e2e tauri mock] unhandled invoke:", cmd, args);
          return null;
      }
    }

    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => handleInvoke(cmd, args || {}),
      transformCallback: (callback, once) => {
        const id = nextCb++;
        callbacks.set(id, { callback, once: !!once });
        return id;
      },
      unregisterCallback: (id) => {
        callbacks.delete(id);
      },
      convertFileSrc: (path) => path,
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    };
  })();`;
}
