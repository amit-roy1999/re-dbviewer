export type CompareSide = {
  columns: string[];
  rows: unknown[][];
};

export type RowDiff =
  | { kind: "onlyA"; key: string; row: unknown[] }
  | { kind: "onlyB"; key: string; row: unknown[] }
  | {
      kind: "diff";
      key: string;
      rowA: unknown[];
      rowB: unknown[];
      columns: string[];
    };

function cellKey(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function rowKey(row: unknown[], keyIndexes: number[]): string {
  return keyIndexes.map((i) => cellKey(row[i])).join("\u0001");
}

/** Compare two result sets by key column indexes (same schema order assumed). */
export function compareRows(
  a: CompareSide,
  b: CompareSide,
  keyColumns: string[],
): RowDiff[] {
  const keyIdxA = keyColumns.map((c) => a.columns.indexOf(c));
  const keyIdxB = keyColumns.map((c) => b.columns.indexOf(c));
  if (keyIdxA.some((i) => i < 0) || keyIdxB.some((i) => i < 0)) {
    throw new Error("Key column missing on one side");
  }
  const mapA = new Map<string, unknown[]>();
  for (const row of a.rows) mapA.set(rowKey(row, keyIdxA), row);
  const mapB = new Map<string, unknown[]>();
  for (const row of b.rows) mapB.set(rowKey(row, keyIdxB), row);

  const diffs: RowDiff[] = [];
  for (const [key, row] of mapA) {
    const other = mapB.get(key);
    if (!other) {
      diffs.push({ kind: "onlyA", key, row });
      continue;
    }
    const changed: string[] = [];
    for (let i = 0; i < a.columns.length; i++) {
      const col = a.columns[i];
      const j = b.columns.indexOf(col);
      if (j < 0) continue;
      if (cellKey(row[i]) !== cellKey(other[j])) changed.push(col);
    }
    if (changed.length) {
      diffs.push({ kind: "diff", key, rowA: row, rowB: other, columns: changed });
    }
  }
  for (const [key, row] of mapB) {
    if (!mapA.has(key)) diffs.push({ kind: "onlyB", key, row });
  }
  return diffs;
}
