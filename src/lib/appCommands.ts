import { ADMIN_NAV, type AdminViewId } from "@/lib/adminNav";
import { adminSupported } from "@/lib/adminSql";
import type { ToolId } from "@/components/tools/ToolsHost";
import type { WorkspaceActions } from "@/lib/workspaceActions";
import { UI_ZOOM_STEP } from "@/lib/preferences";

export type CommandWhen = "always" | "connected" | "adminEngine";

/** Table/view from the front connection schema (for palette search). */
export type CommandTableEntry = {
  ref: string;
  name: string;
  kind: string;
  schema?: string;
};

export type CommandContext = {
  connected: boolean;
  engine?: string;
  actions: WorkspaceActions | null;
  /** Schema objects on the active connection (tables + views). */
  tables?: CommandTableEntry[];
  openPrefs: () => void;
  openShortcuts: () => void;
  setTool: (id: ToolId) => void;
  toggleTheme: () => void;
  bumpZoom: (delta: number) => void;
  resetZoom: () => void;
  disconnect: () => void;
  newWindow: () => void;
};

export type AppCommand = {
  id: string;
  title: string;
  keywords: string[];
  group: string;
  when: CommandWhen;
  run: (ctx: CommandContext) => void;
};

function cmd(
  partial: Omit<AppCommand, "keywords"> & { keywords?: string[] },
): AppCommand {
  return { keywords: [], ...partial };
}

/** Full app feature catalog (not database rows). */
export function buildAppCommands(): AppCommand[] {
  const list: AppCommand[] = [
    cmd({
      id: "file.new-query",
      title: "New Query Tab",
      group: "File",
      when: "connected",
      keywords: ["sql", "editor", "tab"],
      run: (c) => c.actions?.newQueryTab(),
    }),
    cmd({
      id: "file.open-sql",
      title: "Open SQL…",
      group: "File",
      when: "connected",
      keywords: ["file", "import"],
      run: (c) => c.actions?.openSqlFile(),
    }),
    cmd({
      id: "file.save-sql",
      title: "Save SQL",
      group: "File",
      when: "connected",
      keywords: ["file"],
      run: (c) => c.actions?.saveSqlFile(),
    }),
    cmd({
      id: "file.save-sql-as",
      title: "Save SQL As…",
      group: "File",
      when: "connected",
      keywords: ["file"],
      run: (c) => c.actions?.saveSqlFileAs(),
    }),
    cmd({
      id: "file.export-csv",
      title: "Export Result CSV…",
      group: "File",
      when: "connected",
      keywords: ["export", "csv"],
      run: (c) => c.actions?.exportQueryCsv(),
    }),
    cmd({
      id: "file.dump-schema",
      title: "Dump Schema SQL…",
      group: "File",
      when: "connected",
      keywords: ["backup", "export", "ddl"],
      run: (c) => c.actions?.dumpSchema(false),
    }),
    cmd({
      id: "file.dump-tables",
      title: "Dump Selected Tables…",
      group: "File",
      when: "connected",
      keywords: ["backup", "export"],
      run: (c) => c.actions?.dumpTables(),
    }),
    cmd({
      id: "file.restore",
      title: "Restore SQL File…",
      group: "File",
      when: "connected",
      keywords: ["import", "sql"],
      run: (c) => c.actions?.restoreSql(),
    }),
    cmd({
      id: "file.prefs",
      title: "Preferences…",
      group: "File",
      when: "always",
      keywords: ["settings", "config", "options", "font", "zoom", "limit"],
      run: (c) => c.openPrefs(),
    }),
    cmd({
      id: "file.reconnect",
      title: "Reconnect",
      group: "File",
      when: "connected",
      keywords: ["connection"],
      run: (c) => c.actions?.reconnect(),
    }),
    cmd({
      id: "file.disconnect",
      title: "Disconnect",
      group: "File",
      when: "connected",
      keywords: ["close", "connection"],
      run: (c) => c.disconnect(),
    }),
    cmd({
      id: "file.new-window",
      title: "New Window",
      group: "File",
      when: "always",
      keywords: ["window"],
      run: (c) => c.newWindow(),
    }),

    cmd({
      id: "edit.format",
      title: "Format SQL",
      group: "Edit",
      when: "connected",
      keywords: ["pretty", "indent"],
      run: (c) => c.actions?.formatSql(),
    }),

    cmd({
      id: "query.script",
      title: "Run Script",
      group: "Query",
      when: "connected",
      keywords: ["execute", "all"],
      run: (c) => c.actions?.runScript(),
    }),
    cmd({
      id: "query.stop",
      title: "Stop Query",
      group: "Query",
      when: "connected",
      keywords: ["cancel", "abort"],
      run: (c) => c.actions?.stopQuery(),
    }),
    cmd({
      id: "query.begin",
      title: "Begin Transaction",
      group: "Query",
      when: "connected",
      keywords: ["tx", "transaction"],
      run: (c) => c.actions?.beginTx(),
    }),
    cmd({
      id: "query.commit",
      title: "Commit Transaction",
      group: "Query",
      when: "connected",
      keywords: ["tx"],
      run: (c) => c.actions?.commitTx(),
    }),
    cmd({
      id: "query.rollback",
      title: "Rollback Transaction",
      group: "Query",
      when: "connected",
      keywords: ["tx"],
      run: (c) => c.actions?.rollbackTx(),
    }),

    cmd({
      id: "view.history",
      title: "Toggle History",
      group: "View",
      when: "connected",
      keywords: ["panel", "log"],
      run: (c) => c.actions?.toggleHistory(),
    }),
    cmd({
      id: "view.snippets",
      title: "Toggle Snippets",
      group: "View",
      when: "connected",
      keywords: ["panel", "bookmark"],
      run: (c) => c.actions?.toggleSnippets(),
    }),
    cmd({
      id: "view.help",
      title: "Toggle Context Help",
      group: "View",
      when: "connected",
      keywords: ["panel", "docs"],
      run: (c) => c.actions?.toggleHelp(),
    }),
    cmd({
      id: "view.search-data",
      title: "Search Data…",
      group: "View",
      when: "connected",
      keywords: ["tables", "like", "rows", "find in data"],
      run: (c) => c.actions?.globalSearch(),
    }),
    cmd({
      id: "view.inspect",
      title: "Inspect Table…",
      group: "View",
      when: "connected",
      keywords: ["structure"],
      run: (c) => c.actions?.inspectTable(),
    }),
    cmd({
      id: "view.schema-inspector",
      title: "Schema Inspector…",
      group: "View",
      when: "connected",
      keywords: ["tables", "counts"],
      run: (c) => c.actions?.schemaInspector(),
    }),
    cmd({
      id: "view.zoom-in",
      title: "Zoom In",
      group: "View",
      when: "always",
      keywords: ["ui", "scale"],
      run: (c) => c.bumpZoom(UI_ZOOM_STEP),
    }),
    cmd({
      id: "view.zoom-out",
      title: "Zoom Out",
      group: "View",
      when: "always",
      keywords: ["ui", "scale"],
      run: (c) => c.bumpZoom(-UI_ZOOM_STEP),
    }),
    cmd({
      id: "view.zoom-reset",
      title: "Reset Zoom",
      group: "View",
      when: "always",
      keywords: ["ui", "100"],
      run: (c) => c.resetZoom(),
    }),
    cmd({
      id: "view.shortcuts",
      title: "Keyboard Shortcuts…",
      group: "View",
      when: "always",
      keywords: ["hotkeys", "keymap"],
      run: (c) => c.openShortcuts(),
    }),
    cmd({
      id: "view.theme",
      title: "Toggle Theme",
      group: "View",
      when: "always",
      keywords: ["dark", "light", "appearance"],
      run: (c) => c.toggleTheme(),
    }),
    cmd({
      id: "view.prefs",
      title: "Preferences…",
      group: "Preferences",
      when: "always",
      keywords: ["settings", "config", "editor", "font", "tab size", "soft wrap"],
      run: (c) => c.openPrefs(),
    }),

    cmd({
      id: "tools.admin",
      title: "Server Admin (Workbench Administration)…",
      group: "Tools",
      when: "adminEngine",
      keywords: ["administration", "workbench"],
      run: (c) => c.actions?.openServerAdmin(),
    }),
    cmd({
      id: "tools.eer",
      title: "EER Diagram…",
      group: "Tools",
      when: "connected",
      keywords: ["erd", "relations", "diagram"],
      run: (c) => c.setTool("eer"),
    }),
    cmd({
      id: "tools.compare",
      title: "Schema Compare…",
      group: "Tools",
      when: "connected",
      keywords: ["diff"],
      run: (c) => c.setTool("compare"),
    }),
    cmd({
      id: "tools.data-compare",
      title: "Data Compare…",
      group: "Tools",
      when: "connected",
      keywords: ["row", "diff", "data", "compare"],
      run: (c) => c.setTool("dataCompare"),
    }),
    cmd({
      id: "tools.schema-sync",
      title: "Schema Sync…",
      group: "Tools",
      when: "connected",
      keywords: ["sync", "push", "missing"],
      run: (c) => c.setTool("schemaSync"),
    }),
    cmd({
      id: "tools.migrate",
      title: "Migration Wizard…",
      group: "Tools",
      when: "connected",
      keywords: ["copy", "transfer"],
      run: (c) => c.setTool("migrate"),
    }),
    cmd({
      id: "tools.fake-data",
      title: "Fake Data Factory…",
      group: "Tools",
      when: "connected",
      keywords: ["seed", "generate"],
      run: (c) => c.setTool("fakeData"),
    }),
    cmd({
      id: "tools.visualize",
      title: "Visualize Data…",
      group: "Tools",
      when: "connected",
      keywords: ["chart", "graph", "vega", "plot", "bar", "line"],
      run: (c) => c.setTool("visualize"),
    }),
    cmd({
      id: "tools.vqb",
      title: "Visual Query Builder…",
      group: "Tools",
      when: "connected",
      keywords: ["join", "visual", "query", "builder", "relations"],
      run: (c) => c.setTool("vqb"),
    }),
    cmd({
      id: "tools.pivot",
      title: "Pivot / Crosstab…",
      group: "Tools",
      when: "connected",
      keywords: ["pivot", "crosstab", "matrix"],
      run: (c) => c.setTool("pivot"),
    }),
    cmd({
      id: "tools.notebook",
      title: "Query Notebook…",
      group: "Tools",
      when: "connected",
      keywords: ["notebook", "cells", "multi"],
      run: (c) => c.setTool("notebook"),
    }),
    cmd({
      id: "tools.ai-sql",
      title: "AI SQL assist…",
      group: "Tools",
      when: "connected",
      keywords: ["ai", "assist", "generate", "suggest"],
      run: (c) => c.actions?.aiSqlAssist?.(),
    }),
    cmd({
      id: "file.git-add-sql",
      title: "Git: copy add for SQL file",
      group: "File",
      when: "connected",
      keywords: ["git", "stage", "commit"],
      run: (c) => c.actions?.copyGitAddForSql?.(),
    }),
  ];

  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      list.push(
        cmd({
          id: `admin.${item.id}`,
          title: `Administration: ${item.label}`,
          group: "Administration",
          when: "adminEngine",
          keywords: [
            "admin",
            group.label.toLowerCase(),
            item.label.toLowerCase(),
            item.id,
          ],
          run: (c) => c.actions?.openAdminView?.(item.id as AdminViewId),
        }),
      );
    }
  }

  return list;
}

/** Dynamic commands for open-connection tables/views (not row data). */
export function buildTableCommands(tables: CommandTableEntry[]): AppCommand[] {
  return tables.map((t) => {
    const isView = t.kind === "view";
    return cmd({
      id: `table.${t.ref}`,
      title: isView ? `Open view ${t.ref}` : `Open table ${t.ref}`,
      group: "Tables",
      when: "connected",
      keywords: [
        t.name,
        t.ref,
        t.schema ?? "",
        isView ? "view" : "table",
        "schema",
        "entity",
        "open",
      ],
      run: (c) => c.actions?.openTable?.(t.ref),
    });
  });
}

export function commandAvailable(cmd: AppCommand, ctx: CommandContext): boolean {
  if (cmd.when === "always") return true;
  if (cmd.when === "connected") return ctx.connected;
  if (cmd.when === "adminEngine") {
    return ctx.connected && !!ctx.engine && adminSupported(ctx.engine);
  }
  return false;
}

function matchesQuery(cmd: AppCommand, parts: string[]): boolean {
  const hay = `${cmd.title} ${cmd.group} ${cmd.keywords.join(" ")}`.toLowerCase();
  return parts.every((p) => hay.includes(p));
}

/** Case-insensitive match on title + keywords; gates by `when`. */
export function filterCommands(
  query: string,
  ctx: CommandContext,
  catalog: AppCommand[] = buildAppCommands(),
): AppCommand[] {
  const tables =
    ctx.connected && ctx.tables?.length
      ? buildTableCommands(ctx.tables)
      : [];
  const available = [...catalog, ...tables].filter((c) =>
    commandAvailable(c, ctx),
  );
  const q = query.trim().toLowerCase();
  // Empty query: app commands only (avoid dumping every table).
  if (!q) return available.filter((c) => !c.id.startsWith("table."));
  const parts = q.split(/\s+/).filter(Boolean);
  return available.filter((c) => matchesQuery(c, parts));
}
