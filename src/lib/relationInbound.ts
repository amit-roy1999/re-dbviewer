import type { ForeignKeyInfo, QueryResult } from "@/types";
import { runSql, shortName } from "@/lib/dbApi";

export type InboundFk = ForeignKeyInfo & {
  /** Table that owns the FK (references the target). */
  fromTable: string;
};

function splitRef(table: string): { schema: string | null; name: string } {
  const parts = table.split(".");
  if (parts.length >= 2) {
    return {
      schema: parts.slice(0, -1).join("."),
      name: parts[parts.length - 1],
    };
  }
  return { schema: null, name: table };
}

function esc(s: string) {
  return s.replace(/'/g, "''");
}

/** SQL to list FKs that reference `table` (inbound). Null for SQLite (use scan). */
export function inboundFksSql(engine: string, table: string): string | null {
  const { schema, name } = splitRef(table);
  const n = esc(name);
  const s = schema ? esc(schema) : null;

  if (engine === "mysql" || engine === "mariadb") {
    const schemaPred = s
      ? `REFERENCED_TABLE_SCHEMA = '${s}'`
      : "REFERENCED_TABLE_SCHEMA = DATABASE()";
    return (
      `SELECT CONSTRAINT_NAME, TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ` +
      `REFERENCED_COLUMN_NAME ` +
      `FROM information_schema.KEY_COLUMN_USAGE ` +
      `WHERE ${schemaPred} AND REFERENCED_TABLE_NAME = '${n}' ` +
      `AND REFERENCED_TABLE_NAME IS NOT NULL ` +
      `ORDER BY TABLE_SCHEMA, TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`
    );
  }

  if (engine === "postgres") {
    const refSchemaPred = s
      ? `ccu.table_schema = '${s}'`
      : `ccu.table_schema = current_schema()`;
    return (
      `SELECT tc.constraint_name, tc.table_schema, tc.table_name, kcu.column_name, ccu.column_name ` +
      `FROM information_schema.table_constraints tc ` +
      `JOIN information_schema.key_column_usage kcu ` +
      `  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema ` +
      `JOIN information_schema.constraint_column_usage ccu ` +
      `  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema ` +
      `WHERE tc.constraint_type = 'FOREIGN KEY' ` +
      `AND ccu.table_name = '${n}' AND ${refSchemaPred} ` +
      `ORDER BY tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position`
    );
  }

  if (engine === "mssql") {
    const schemaPred = s
      ? `SCHEMA_NAME(ref_t.schema_id) = N'${s}'`
      : `SCHEMA_NAME(ref_t.schema_id) = SCHEMA_NAME()`;
    return (
      `SELECT fk.name, SCHEMA_NAME(parent_t.schema_id), parent_t.name, ` +
      `parent_c.name, ref_c.name ` +
      `FROM sys.foreign_keys fk ` +
      `JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id ` +
      `JOIN sys.tables parent_t ON fkc.parent_object_id = parent_t.object_id ` +
      `JOIN sys.columns parent_c ON fkc.parent_object_id = parent_c.object_id AND fkc.parent_column_id = parent_c.column_id ` +
      `JOIN sys.tables ref_t ON fkc.referenced_object_id = ref_t.object_id ` +
      `JOIN sys.columns ref_c ON fkc.referenced_object_id = ref_c.object_id AND fkc.referenced_column_id = ref_c.column_id ` +
      `WHERE ref_t.name = N'${n}' AND ${schemaPred} ` +
      `ORDER BY SCHEMA_NAME(parent_t.schema_id), parent_t.name, fk.name, fkc.constraint_column_id`
    );
  }

  return null;
}

/** Parse inbound FK rows: name, fromSchema, fromTable, column, refColumn. */
export function parseInboundFkRows(res: QueryResult, targetTable: string): InboundFk[] {
  const map = new Map<string, InboundFk>();
  for (const row of res.rows) {
    const cname = String(row[0] ?? "");
    const fromSchema = row[1] != null ? String(row[1]) : "";
    const fromName = String(row[2] ?? "");
    const col = String(row[3] ?? "");
    const refCol = String(row[4] ?? "");
    const fromTable =
      fromSchema && fromSchema !== "main" && fromSchema !== "dbo"
        ? `${fromSchema}.${fromName}`
        : fromName;
    const key = `${fromTable}\0${cname}`;
    const existing = map.get(key);
    if (existing) {
      existing.columns.push(col);
      existing.refColumns.push(refCol);
    } else {
      map.set(key, {
        name: cname,
        columns: [col],
        refTable: targetTable,
        refColumns: [refCol],
        fromTable,
      });
    }
  }
  return [...map.values()];
}

function quoteSqliteIdent(table: string): string {
  if (table.includes(".")) {
    return table
      .split(".")
      .map((p) => `"${p.replace(/"/g, '""')}"`)
      .join(".");
  }
  return `"${table.replace(/"/g, '""')}"`;
}

/**
 * Load inbound FKs pointing at `table`.
 * SQLite: scan candidate tables' PRAGMA foreign_key_list.
 */
export async function loadInboundFks(
  engine: string,
  table: string,
  connectionId: string | null,
  sqliteCandidates: string[] = [],
): Promise<InboundFk[]> {
  const targetBare = shortName(table).toLowerCase();

  if (engine === "sqlite") {
    const found: InboundFk[] = [];
    for (const cand of sqliteCandidates) {
      if (shortName(cand).toLowerCase() === targetBare) continue;
      try {
        const res = await runSql(
          `PRAGMA foreign_key_list(${quoteSqliteIdent(shortName(cand))})`,
          connectionId,
        );
        const byId = new Map<string, InboundFk>();
        for (const row of res.rows) {
          const refTable = String(row[2] ?? "");
          if (shortName(refTable).toLowerCase() !== targetBare) continue;
          const id = String(row[0] ?? "0");
          const fromCol = String(row[3] ?? "");
          const toCol = String(row[4] ?? "");
          const key = `${cand}\0${id}`;
          const existing = byId.get(key);
          if (existing) {
            existing.columns.push(fromCol);
            existing.refColumns.push(toCol);
          } else {
            byId.set(key, {
              name: `fk_${shortName(cand)}_${id}`,
              columns: [fromCol],
              refTable: table,
              refColumns: [toCol],
              fromTable: cand,
            });
          }
        }
        found.push(...byId.values());
      } catch {
        // skip
      }
    }
    return found;
  }

  const sql = inboundFksSql(engine, table);
  if (!sql) return [];
  const res = await runSql(sql, connectionId);
  return parseInboundFkRows(res, table);
}
