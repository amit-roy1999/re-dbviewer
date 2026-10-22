import type { Diff, Snapshot } from "@/lib/schemaCompare";
import { compareSnapshots } from "@/lib/schemaCompare";

export type SyncPlan = {
  missingOnB: string[];
  onlyOnB: string[];
  columnConflicts: Diff[];
  rowCountHints: { table: string; countA: number; countB: number }[];
};

/** Build a one-way A→B sync plan from schema snapshots + optional row counts. */
export function buildSyncPlan(
  snapA: Snapshot,
  snapB: Snapshot,
  nameToRefA: Record<string, string>,
  rowCounts?: Record<string, { a: number; b: number }>,
): SyncPlan {
  const diffs = compareSnapshots(snapA, snapB);
  const missingOnB: string[] = [];
  const onlyOnB: string[] = [];
  const columnConflicts: Diff[] = [];
  for (const d of diffs) {
    if (d.kind === "table only in A") {
      const ref = nameToRefA[d.table] ?? d.table;
      missingOnB.push(ref);
    } else if (d.kind === "table only in B") {
      onlyOnB.push(d.table);
    } else {
      columnConflicts.push(d);
    }
  }
  const rowCountHints: SyncPlan["rowCountHints"] = [];
  if (rowCounts) {
    for (const [table, c] of Object.entries(rowCounts)) {
      if (c.a !== c.b) rowCountHints.push({ table, countA: c.a, countB: c.b });
    }
  }
  return { missingOnB, onlyOnB, columnConflicts, rowCountHints };
}
