import { quoteIdent } from "@/lib/dbApi";
import type { QueryResult } from "@/types";

export type TableStats = {
  rows: number | null;
  rowsApprox: boolean;
  sizeBytes: number | null;
};

function splitRef(ref: string): { schema: string | null; name: string } {
  const i = ref.lastIndexOf(".");
  if (i <= 0) return { schema: null, name: ref };
  return { schema: ref.slice(0, i), name: ref.slice(i + 1) };
}

function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** One-row catalog / count query for structure-tab stats. */
export function tableStatsSql(engine: string, table: string): string | null {
  const { schema, name } = splitRef(table);
  if (engine === "mysql" || engine === "mariadb") {
    const schemaPred = schema
      ? `TABLE_SCHEMA = ${sqlStr(schema)}`
      : "TABLE_SCHEMA = DATABASE()";
    return `SELECT TABLE_ROWS, (DATA_LENGTH + INDEX_LENGTH) FROM information_schema.TABLES WHERE ${schemaPred} AND TABLE_NAME = ${sqlStr(name)} LIMIT 1`;
  }
  if (engine === "postgres") {
    const schemaPred = schema
      ? `schemaname = ${sqlStr(schema)}`
      : "schemaname = current_schema()";
    return `SELECT COALESCE(n_live_tup, 0)::bigint, pg_total_relation_size(relid)::bigint FROM pg_stat_user_tables WHERE ${schemaPred} AND relname = ${sqlStr(name)} LIMIT 1`;
  }
  if (engine === "sqlite") {
    return `SELECT COUNT(*) FROM ${quoteIdent(engine, table)}`;
  }
  if (engine === "mssql") {
    const sch = schema ?? "dbo";
    return `SELECT SUM(p.rows) FROM sys.partitions p INNER JOIN sys.tables t ON p.object_id = t.object_id INNER JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = N${sqlStr(sch)} AND t.name = N${sqlStr(name)} AND p.index_id IN (0, 1)`;
  }
  return null;
}

export function parseTableStats(engine: string, result: QueryResult): TableStats {
  const row = result.rows[0];
  if (!row) {
    return { rows: null, rowsApprox: false, sizeBytes: null };
  }
  const rowsRaw = row[0];
  const rows =
    rowsRaw == null || rowsRaw === ""
      ? null
      : Number(rowsRaw);
  const rowsNum = rows != null && Number.isFinite(rows) ? rows : null;

  if (engine === "sqlite" || engine === "mssql") {
    return {
      rows: rowsNum,
      rowsApprox: engine === "mssql",
      sizeBytes: null,
    };
  }

  const sizeRaw = row[1];
  const size =
    sizeRaw == null || sizeRaw === ""
      ? null
      : Number(sizeRaw);
  return {
    rows: rowsNum,
    rowsApprox: true,
    sizeBytes: size != null && Number.isFinite(size) ? size : null,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024)
    return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatTableStatsLine(opts: {
  table: string;
  columns?: number;
  indexes?: number;
  fks?: number;
  stats?: TableStats | null;
  loading?: boolean;
}): string {
  const parts: string[] = [opts.table];
  if (opts.columns != null) parts.push(`${opts.columns} columns`);
  if (opts.indexes != null) parts.push(`${opts.indexes} indexes`);
  if (opts.fks != null) parts.push(`${opts.fks} FKs`);
  if (opts.loading) {
    parts.push("…");
  } else if (opts.stats) {
    if (opts.stats.rows != null) {
      const n = opts.stats.rows.toLocaleString();
      parts.push(opts.stats.rowsApprox ? `~${n} rows` : `${n} rows`);
    }
    if (opts.stats.sizeBytes != null) {
      parts.push(formatBytes(opts.stats.sizeBytes));
    }
  }
  return parts.join(" · ");
}
