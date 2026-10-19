import type { QueryResult } from "@/types";

export type PlanSummary = {
  steps: number;
  /** Header of the first cost-like column, or "cost" when parsed out of plan text. */
  costLabel: string | null;
  cost: number | null;
};

const COST_COL = /cost|filtered|rows|time/i;

/** Step count (rows) + the first cost-like number of an EXPLAIN result. */
export function summarizePlan(r: QueryResult): PlanSummary {
  let costLabel: string | null = null;
  let cost: number | null = null;
  const col = r.columns.findIndex((c) => /cost/i.test(c));
  const idx = col >= 0 ? col : r.columns.findIndex((c) => COST_COL.test(c));
  if (idx >= 0) {
    for (const row of r.rows) {
      const n = Number(String(row[idx] ?? "").replace(/,/g, ""));
      if (row[idx] != null && Number.isFinite(n)) {
        costLabel = r.columns[idx];
        cost = n;
        break;
      }
    }
  }
  if (cost == null) {
    // Postgres text/JSON plans: "(cost=0.00..8.27 rows=1 ...)" / "Total Cost": 8.27
    for (const row of r.rows) {
      const m = String(row[0] ?? "").match(/cost\s*=\s*[\d.]+\.\.([\d.]+)|"Total Cost":\s*([\d.]+)/i);
      if (m) {
        costLabel = "cost";
        cost = Number(m[1] ?? m[2]);
        break;
      }
    }
  }
  return { steps: r.rows.length, costLabel, cost };
}

export function comparePlans(prev: QueryResult, cur: QueryResult) {
  const a = summarizePlan(prev);
  const b = summarizePlan(cur);
  const pct =
    a.cost != null && b.cost != null && a.cost !== 0
      ? Math.round(((b.cost - a.cost) / Math.abs(a.cost)) * 100)
      : null;
  return { prev: a, cur: b, costDeltaPct: pct };
}
