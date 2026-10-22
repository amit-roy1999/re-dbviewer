import type { ForeignKeyInfo, TableFilter } from "@/types";
import { formatCellDisplay } from "@/lib/cellFormat";
import { quoteIdent, sqlLiteral } from "@/lib/dbApi";

export type FkNavTarget = {
  table: string;
  filters: TableFilter[];
};

/** First outbound FK that includes `columnName`. */
export function fkForColumn(
  fks: ForeignKeyInfo[] | null | undefined,
  columnName: string,
): ForeignKeyInfo | null {
  if (!fks?.length) return null;
  return fks.find((fk) => fk.columns.includes(columnName)) ?? null;
}

/**
 * Build open/peek target for a row under an outbound FK.
 * Returns null if any participating column value is null/undefined,
 * or if column/refColumn lengths mismatch.
 */
export function fkTargetFromRow(
  fk: ForeignKeyInfo,
  columns: { name: string; index: number }[],
  row: unknown[],
): FkNavTarget | null {
  if (!fk.columns.length || fk.columns.length !== fk.refColumns.length) {
    return null;
  }
  const filters: TableFilter[] = [];
  for (let i = 0; i < fk.columns.length; i++) {
    const srcName = fk.columns[i];
    const refName = fk.refColumns[i];
    const col = columns.find((c) => c.name === srcName);
    if (!col) return null;
    const value = row[col.index];
    if (value === null || value === undefined) return null;
    filters.push({
      column: refName,
      op: "eq",
      value: formatCellDisplay(value),
      join: i === 0 ? undefined : "and",
    });
  }
  return { table: fk.refTable, filters };
}

/** SELECT * FROM ref WHERE … LIMIT 20 for inline peek. */
export function buildFkPeekSql(
  engine: string,
  table: string,
  filters: TableFilter[],
): string {
  const safe = quoteIdent(engine, table);
  if (!filters.length) return `SELECT * FROM ${safe} LIMIT 20`;
  const where = filters
    .map((f, i) => {
      const pred = `${quoteIdent(engine, f.column)} = ${sqlLiteral(f.value ?? "", engine)}`;
      if (i === 0) return pred;
      const join = (f.join ?? "and").toUpperCase();
      return `${join} ${pred}`;
    })
    .join(" ");
  return `SELECT * FROM ${safe} WHERE ${where} LIMIT 20`;
}
