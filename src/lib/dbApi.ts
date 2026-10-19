import { invoke } from "@tauri-apps/api/core";
import type {
  QueryResult,
  SavedConnection,
  SchemaNode,
  TableDetails,
} from "@/types";

/** All helpers accept an optional connection id; omitted = the active connection. */
export const runSql = (sql: string, connectionId?: string | null) =>
  invoke<QueryResult>("run_sql", { sql, connectionId: connectionId ?? null });

export const runScript = (sql: string, connectionId?: string | null) =>
  invoke<number>("run_sql_script", { sql, connectionId: connectionId ?? null });

export const listSchema = (connectionId?: string | null) =>
  invoke<SchemaNode[]>("list_schema", { connectionId: connectionId ?? null });

export const describeTable = (table: string, connectionId?: string | null) =>
  invoke<TableDetails>("describe_table", {
    table,
    connectionId: connectionId ?? null,
  });

export const exportTableSql = (
  table: string,
  includeSchema: boolean,
  includeData: boolean,
  connectionId?: string | null,
) =>
  invoke<string>("export_table_sql", {
    table,
    includeSchema,
    includeData,
    connectionId: connectionId ?? null,
  });

export const listOpenConnections = () =>
  invoke<string[]>("list_open_connections");

export const listSavedConnections = () =>
  invoke<SavedConnection[]>("list_connections");

const isMysql = (engine: string) => engine === "mysql" || engine === "mariadb";

export function quoteIdent(engine: string, ident: string): string {
  const q = isMysql(engine) ? "`" : '"';
  return ident
    .split(".")
    .map((p) => `${q}${p.split(q).join(q + q)}${q}`)
    .join(".");
}

export function sqlLiteral(v: unknown, engine: string): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean")
    return engine === "postgres" ? (v ? "TRUE" : "FALSE") : v ? "1" : "0";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  const esc = s.split("'").join("''");
  return `'${isMysql(engine) ? esc.split("\\").join("\\\\") : esc}'`;
}

export function tableRef(schema: string, name: string, engine: string) {
  if (engine === "sqlite" || schema === "main" || schema === "dbo") return name;
  return `${schema}.${name}`;
}

export type TableEntry = {
  schema: string;
  name: string;
  ref: string;
  kind: string;
};

export function flattenTables(nodes: SchemaNode[], engine: string): TableEntry[] {
  const out: TableEntry[] = [];
  for (const s of nodes) {
    for (const t of s.children) {
      if (t.kind === "view") continue;
      out.push({
        schema: s.name,
        name: t.name,
        ref: tableRef(s.name, t.name, engine),
        kind: t.kind,
      });
    }
  }
  return out;
}

export const shortName = (ref: string) => ref.split(".").pop() ?? ref;

/**
 * Make sure a saved connection has a live session. `open_connection` also makes it the
 * active session, so callers pass the id to restore afterwards. Returns a cleanup fn
 * that restores the active connection and closes the session if we opened it.
 */
export async function ensureOpen(
  id: string,
  restoreActiveId: string | null,
): Promise<() => Promise<void>> {
  const open = await listOpenConnections();
  const opened = !open.includes(id);
  if (opened) await invoke("open_connection", { id });
  return async () => {
    if (opened) await invoke("close_connection", { connectionId: id });
    if (restoreActiveId && restoreActiveId !== id) {
      try {
        await invoke("set_active_connection", { id: restoreActiveId });
      } catch {
        // restore target is gone; nothing to do
      }
    }
  };
}
