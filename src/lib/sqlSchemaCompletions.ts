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
