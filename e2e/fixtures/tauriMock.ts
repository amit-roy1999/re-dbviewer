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

/** Select-only connection for permission-negative specs. */
export const RESTRICTED_CONNECTION = {
  id: "conn-mysql-restricted",
  name: "Restricted MySQL",
  engine: "mysql",
  categoryId: null,
  categoryName: null,
  isFavorite: false,
  accentColor: "#dc2626",
  config: {
    host: "127.0.0.1",
    port: 3306,
    user: "ro",
    database: "demo",
  },
  permissions: {
    allowSelect: true,
    allowInsert: false,
    allowUpdate: false,
    allowDelete: false,
    allowDdl: false,
  },
} as const;

export const DEMO_SCHEMA = [
  {
    name: "demo",
    kind: "schema",
    children: [
      { name: "users", kind: "table", children: [] },
      { name: "orders", kind: "table", children: [] },
      { name: "v_active", kind: "view", children: [] },
    ],
  },
];

export const DEMO_QUERY_RESULT = {
  columns: ["ok"],
  rows: [[1]],
  rowsAffected: null,
};

export const DEMO_PREVIEW = {
  columns: ["id", "name"],
  rows: [
    [1, "Ada"],
    [2, "Grace"],
  ],
  rowsAffected: null,
};

/**
 * Installs `window.__TAURI_INTERNALS__` so `@tauri-apps/api` invoke works in
 * Chromium without a native Tauri runtime.
 *
 * Must be a serializable function body for `page.addInitScript`.
 * Flags live on `window.__E2E__` (set from tests via page.evaluate).
 */
export function tauriInitScriptSource(): string {
  const demo = JSON.stringify(DEMO_CONNECTION);
  const restricted = JSON.stringify(RESTRICTED_CONNECTION);
  const schema = JSON.stringify(DEMO_SCHEMA);
  const queryResult = JSON.stringify(DEMO_QUERY_RESULT);
  const preview = JSON.stringify(DEMO_PREVIEW);

  return `(() => {
    const DEMO = ${demo};
    const RESTRICTED = ${restricted};
    const SCHEMA = ${schema};
    const QUERY = ${queryResult};
    const PREVIEW = ${preview};

    const store = {
      connections: [structuredClone(DEMO), structuredClone(RESTRICTED)],
      categories: [],
      openIds: [],
    };

    window.__E2E__ = window.__E2E__ || {
      flags: {},
      lastInvokes: [],
      dialogOpenResult: "/tmp/e2e-import.csv",
      dialogSaveResult: "/tmp/e2e-export.sql",
      dialogConfirm: true,
      cancelDialog: false,
    };

    const callbacks = new Map();
    let nextCb = 1;
    let idSeq = 100;

    function findConn(id) {
      return store.connections.find((c) => c.id === id) || null;
    }

    function handleInvoke(cmd, args) {
      const e2e = window.__E2E__;
      e2e.lastInvokes.push({ cmd, args: args || {} });
      const flags = e2e.flags || {};

      if (typeof cmd === "string" && cmd.startsWith("plugin:dialog|")) {
        if (e2e.cancelDialog) return null;
        if (cmd.includes("save")) return e2e.dialogSaveResult;
        if (cmd.includes("open")) return e2e.dialogOpenResult;
        if (cmd.includes("ask") || cmd.includes("confirm")) return !!e2e.dialogConfirm;
        return null;
      }
      if (typeof cmd === "string" && cmd.startsWith("plugin:")) {
        return null;
      }

      switch (cmd) {
        case "list_connections":
          return store.connections.map((c) => structuredClone(c));
        case "list_categories":
          return store.categories.map((c) => structuredClone(c));
        case "save_category": {
          const cat = { id: "cat-" + (++idSeq), name: (args && args.name) || "Cat" };
          store.categories.push(cat);
          return structuredClone(cat);
        }
        case "delete_category":
          store.categories = store.categories.filter((c) => c.id !== args.id);
          return null;
        case "list_open_connections":
          return [...store.openIds];
        case "open_connection": {
          if (flags.failOpen) throw new Error("e2e: open failed");
          const id = (args && args.id) || DEMO.id;
          const c = findConn(id);
          if (!c) throw new Error("connection not found: " + id);
          if (!store.openIds.includes(id)) store.openIds.push(id);
          return structuredClone(c);
        }
        case "close_connection": {
          const id = args && args.id;
          if (id) store.openIds = store.openIds.filter((x) => x !== id);
          else store.openIds = [];
          return null;
        }
        case "set_active_connection":
          return null;
        case "save_connection": {
          const c = {
            id: "conn-" + (++idSeq),
            name: args.name,
            engine: args.engine,
            categoryId: args.categoryId ?? null,
            categoryName: null,
            isFavorite: !!args.isFavorite,
            accentColor: args.accentColor || "#2563eb",
            config: args.config || {},
            permissions: args.permissions || DEMO.permissions,
          };
          store.connections.push(c);
          return structuredClone(c);
        }
        case "update_connection": {
          const i = store.connections.findIndex((c) => c.id === args.id);
          if (i < 0) throw new Error("missing connection");
          store.connections[i] = {
            ...store.connections[i],
            name: args.name,
            engine: args.engine,
            categoryId: args.categoryId ?? null,
            isFavorite: !!args.isFavorite,
            accentColor: args.accentColor || store.connections[i].accentColor,
            config: args.config || store.connections[i].config,
            permissions: args.permissions || store.connections[i].permissions,
          };
          return structuredClone(store.connections[i]);
        }
        case "delete_connection":
          store.connections = store.connections.filter((c) => c.id !== args.id);
          store.openIds = store.openIds.filter((x) => x !== args.id);
          return null;
        case "duplicate_connection": {
          const src = findConn(args.id);
          if (!src) throw new Error("missing");
          const copy = {
            ...structuredClone(src),
            id: "conn-" + (++idSeq),
            name: src.name + " copy",
            isFavorite: false,
          };
          store.connections.push(copy);
          return structuredClone(copy);
        }
        case "set_favorite": {
          const c = findConn(args.id);
          if (c) c.isFavorite = !!args.isFavorite;
          return null;
        }
        case "write_clipboard":
        case "write_text_file":
        case "append_log":
          return null;
        case "read_clipboard":
          return "";
        case "read_text_file":
          return "id,name\\n1,Ada\\n";
        case "read_diagnostics":
          return "re-dbviewer diagnostics\\nversion=e2e\\n";
        case "list_schema":
          return structuredClone(SCHEMA);
        case "describe_table":
          return {
            columns: [
              { name: "id", dataType: "INT", nullable: false, defaultValue: null, isPk: true },
              { name: "name", dataType: "VARCHAR", nullable: true, defaultValue: null, isPk: false },
            ],
            foreignKeys: [],
            indexes: [],
          };
        case "preview_table":
          return structuredClone(PREVIEW);
        case "run_sql": {
          if (flags.failRunSql) throw new Error("e2e: run_sql failed");
          const sql = String((args && args.sql) || "");
          if (/VERSION\\s*\\(/i.test(sql)) {
            return { columns: ["VERSION()"], rows: [["8.0.36-e2e"]], rowsAffected: null };
          }
          if (/information_schema|pg_stat|PROCESSLIST|SHOW\\s+/i.test(sql)) {
            return {
              columns: ["Id", "User", "Host", "db", "Command", "Time", "State", "Info"],
              rows: [[1, "root", "localhost", "demo", "Query", 0, "", null]],
              rowsAffected: null,
            };
          }
          return structuredClone(QUERY);
        }
        case "run_sql_script":
          if (flags.failRunSql) throw new Error("e2e: run_sql_script failed");
          return 1;
        case "export_table_sql": {
          const t = (args && args.table) || "users";
          const schema = args && args.includeSchema !== false;
          const data = !!(args && args.includeData);
          let out = schema ? "CREATE TABLE " + t + " (id INT);\\n" : "";
          if (data) out += "INSERT INTO " + t + " VALUES (1);\\n";
          return out;
        }
        case "export_table_csv":
          return "id,name\\n1,Ada\\n";
        case "import_table_csv":
          return 2;
        case "generate_fake_data":
          return { inserted: 10, sqlPreview: "INSERT ..." };
        case "test_connection":
          if (flags.failTestConnection) throw new Error("e2e: test failed");
          return "ok";
        default:
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
