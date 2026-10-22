import type { QueryResult } from "@/types";

/** Simple crosstab: rows keyed by rowKey, columns by colKey, values aggregated. */
export function pivotResult(
  result: QueryResult,
  rowKey: string,
  colKey: string,
  valKey: string,
  agg: "sum" | "count" | "first" = "sum",
): QueryResult {
  const ri = result.columns.indexOf(rowKey);
  const ci = result.columns.indexOf(colKey);
  const vi = result.columns.indexOf(valKey);
  if (ri < 0 || ci < 0 || (agg !== "count" && vi < 0)) {
    throw new Error("Pivot columns not found");
  }
  const colSet = new Set<string>();
  const map = new Map<string, Map<string, number>>();
  for (const row of result.rows) {
    const rk = String(row[ri] ?? "");
    const ck = String(row[ci] ?? "");
    colSet.add(ck);
    if (!map.has(rk)) map.set(rk, new Map());
    const m = map.get(rk)!;
    const prev = m.get(ck) ?? 0;
    if (agg === "count") m.set(ck, prev + 1);
    else if (agg === "first" && !m.has(ck)) m.set(ck, Number(row[vi]) || 0);
    else if (agg === "sum") m.set(ck, prev + (Number(row[vi]) || 0));
  }
  const cols = [rowKey, ...[...colSet].sort()];
  const rows = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rk, m]) => [rk, ...cols.slice(1).map((c) => m.get(c) ?? 0)]);
  return { columns: cols, rows, rowsAffected: null };
}
