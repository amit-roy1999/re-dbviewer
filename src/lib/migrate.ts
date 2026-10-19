import { createTableForTarget, type TypeRule } from "@/lib/typeMap";
import {
  describeTable,
  exportTableSql,
  quoteIdent,
  runScript,
  runSql,
  shortName,
  sqlLiteral,
} from "@/lib/dbApi";

export type MigrateOptions = {
  sourceId: string;
  sourceEngine: string;
  targetId: string;
  targetEngine: string;
  tables: string[];
  copySchema: boolean;
  copyData: boolean;
  dropExisting: boolean;
  batchSize: number;
  /** Used to emit DDL when source and target engines differ. */
  typeMap?: TypeRule[];
};

export type MigrateLog = (line: string) => void;

async function sourcePageSql(o: MigrateOptions, table: string, offset: number) {
  const eng = o.sourceEngine;
  const ref = quoteIdent(eng, table);
  let order = "1";
  try {
    const pk = (await describeTable(table, o.sourceId)).columns
      .filter((c) => c.isPk)
      .map((c) => quoteIdent(eng, c.name));
    if (pk.length) order = pk.join(", ");
  } catch {
    // fall back to ordinal ordering
  }
  if (eng === "mssql") {
    return `SELECT * FROM ${ref} ORDER BY ${order === "1" ? "(SELECT NULL)" : order} OFFSET ${offset} ROWS FETCH NEXT ${o.batchSize} ROWS ONLY`;
  }
  return `SELECT * FROM ${ref} ORDER BY ${order} LIMIT ${o.batchSize} OFFSET ${offset}`;
}

/**
 * MVP migration: DDL via the source's export_table_sql (source dialect, so best for same-engine
 * pairs), data via paged SELECT on source + multi-row INSERT on target.
 */
export async function migrateTables(
  o: MigrateOptions,
  log: MigrateLog,
  cancelled: () => boolean,
  progress?: (text: string) => void,
): Promise<{ tables: number; rows: number }> {
  let tableCount = 0;
  let rowCount = 0;
  for (const [ti, table] of o.tables.entries()) {
    const where = `table ${ti + 1}/${o.tables.length}: ${table}`;
    progress?.(`${where}, ${rowCount} rows copied`);
    if (cancelled()) {
      log("Cancelled.");
      break;
    }
    const target = shortName(table);
    try {
      if (o.copySchema) {
        if (o.dropExisting) {
          await runSql(
            `DROP TABLE IF EXISTS ${quoteIdent(o.targetEngine, target)}`,
            o.targetId,
          );
        }
        if (o.sourceEngine !== o.targetEngine) {
          const d = await describeTable(table, o.sourceId);
          await runSql(
            createTableForTarget(o.targetEngine, target, d, o.typeMap ?? []),
            o.targetId,
          );
        } else {
          const ddl = await exportTableSql(table, true, false, o.sourceId);
          await runScript(ddl, o.targetId);
        }
        log(`✓ ${table}: schema created`);
      }
      if (o.copyData) {
        let offset = 0;
        let copied = 0;
        const q = (s: string) => quoteIdent(o.targetEngine, s);
        for (;;) {
          if (cancelled()) break;
          const page = await runSql(
            await sourcePageSql(o, table, offset),
            o.sourceId,
          );
          if (page.rows.length === 0) break;
          const cols = page.columns.map(q).join(", ");
          const values = page.rows
            .map(
              (r) =>
                `(${r.map((v) => sqlLiteral(v, o.targetEngine)).join(", ")})`,
            )
            .join(",\n");
          await runSql(
            `INSERT INTO ${q(target)} (${cols}) VALUES\n${values}`,
            o.targetId,
          );
          copied += page.rows.length;
          offset += page.rows.length;
          progress?.(`${where}, ${rowCount + copied} rows copied`);
          if (page.rows.length < o.batchSize) break;
        }
        rowCount += copied;
        log(`✓ ${table}: ${copied} rows copied`);
      }
      tableCount++;
    } catch (e) {
      log(`✗ ${table}: ${String(e)}`);
    }
  }
  progress?.(`${tableCount}/${o.tables.length} tables, ${rowCount} rows copied`);
  return { tables: tableCount, rows: rowCount };
}
