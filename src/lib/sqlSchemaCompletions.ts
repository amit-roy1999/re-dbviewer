import type { SQLNamespace } from "@codemirror/lang-sql";
import type { SchemaNode, TableDetails } from "@/types";
import type { RoutineInfo } from "@/lib/objectDdl";

/**
 * Build the `@codemirror/lang-sql` schema namespace from tree + column cache.
 * Views are tagged (`detail: "view"`) and routines are offered as functions.
 */
export function buildSqlSchemaMap(
  schema: SchemaNode[],
  columnsByTable: Record<string, string[]>,
  routines: RoutineInfo[] = [],
): Record<string, SQLNamespace> {
  const map: Record<string, SQLNamespace> = {};
  for (const s of schema) {
    const schemaName = s.name;
    for (const child of s.children) {
      const short = child.name;
      const full =
        schemaName === "main" || schemaName === "dbo"
          ? short
          : `${schemaName}.${short}`;
      const cols = columnsByTable[full] ?? columnsByTable[short] ?? [];
      const entry: SQLNamespace =
        child.kind === "view"
          ? {
              self: { label: short, type: "view", detail: "view" },
              children: cols,
            }
          : cols;
      map[short] = entry;
      map[full] = entry;
    }
  }
  for (const r of routines) {
    if (map[r.name]) continue;
    map[r.name] = {
      self: { label: r.name, type: "function", detail: r.kind },
      children: [],
    };
  }
  return map;
}

export function columnsFromDetails(details: TableDetails): string[] {
  return details.columns.map((c) => c.name);
}

/** Table/alias pairs from FROM / JOIN … [AS] alias. */
export function extractTableAliases(
  sql: string,
): { table: string; alias: string }[] {
  const out: { table: string; alias: string }[] = [];
  const re =
    /\b(?:from|join)\s+([`"]?[\w.]+[`"]?)(?:\s+(?:as\s+)?([`"]?[\w]+[`"]?))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const table = m[1].replace(/[`"]/g, "");
    const aliasRaw = m[2]?.replace(/[`"]/g, "");
    if (!aliasRaw) continue;
    const upper = aliasRaw.toUpperCase();
    if (
      [
        "ON",
        "WHERE",
        "LEFT",
        "RIGHT",
        "INNER",
        "OUTER",
        "CROSS",
        "JOIN",
        "GROUP",
        "ORDER",
        "LIMIT",
        "HAVING",
        "SET",
        "INTO",
        "VALUES",
        "SELECT",
        "USING",
      ].includes(upper)
    ) {
      continue;
    }
    out.push({ table, alias: aliasRaw });
  }
  return out;
}

/** Simple WITH cte AS (SELECT a, b, …) name → column list (non-nested). */
export function extractCteColumns(sql: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re =
    /\bwith\s+([\w]+)\s+as\s*\(\s*select\s+([\s\S]*?)\s+from\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const name = m[1];
    const selectList = m[2];
    const cols = selectList
      .split(",")
      .map((part) => {
        const p = part.trim();
        const asMatch = /\bas\s+([`"]?[\w]+[`"]?)\s*$/i.exec(p);
        if (asMatch) return asMatch[1].replace(/[`"]/g, "");
        const bare = p.replace(/[`"]/g, "");
        const dot = bare.lastIndexOf(".");
        return (dot >= 0 ? bare.slice(dot + 1) : bare).trim();
      })
      .filter((c) => c && c !== "*" && !/\W/.test(c.replace(/_/g, "")));
    if (cols.length) out[name] = cols;
  }
  return out;
}

/**
 * Merge alias + CTE completions into a base schema map (does not mutate base).
 */
export function mergeSqlContextCompletions(
  base: Record<string, SQLNamespace>,
  sqlText: string,
  columnsByTable: Record<string, string[]>,
): Record<string, SQLNamespace> {
  const map: Record<string, SQLNamespace> = { ...base };
  for (const { table, alias } of extractTableAliases(sqlText)) {
    const short = table.includes(".") ? table.slice(table.lastIndexOf(".") + 1) : table;
    const cols =
      columnsByTable[table] ??
      columnsByTable[short] ??
      (Array.isArray(base[table])
        ? (base[table] as string[])
        : Array.isArray(base[short])
          ? (base[short] as string[])
          : ((base[table] as { children?: string[] } | undefined)?.children ??
            (base[short] as { children?: string[] } | undefined)?.children ??
            []));
    if (!cols.length) continue;
    map[alias] = {
      self: { label: alias, type: "table", detail: `alias → ${table}` },
      children: cols,
    };
  }
  for (const [cte, cols] of Object.entries(extractCteColumns(sqlText))) {
    map[cte] = {
      self: { label: cte, type: "table", detail: "cte" },
      children: cols,
    };
  }
  return map;
}
