import type { QueryResult } from "@/types";

export type JsonCellEdit = {
  rowIndex: number;
  column: string;
  value: string;
};

/** Match grid cell-edit convention: null/undefined → "". */
export function cellValueToEditString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function visibleColumns(
  result: QueryResult,
  hiddenColumns: string[],
): { name: string; index: number }[] {
  const hide = new Set(hiddenColumns);
  return result.columns
    .map((name, index) => ({ name, index }))
    .filter((c) => !hide.has(c.name));
}

/** Row objects for JSON view; pending overrides replace cell values as strings. */
export function rowsToJson(
  result: QueryResult,
  hiddenColumns: string[] = [],
  cellOverride?: (rowIndex: number, column: string) => string | undefined,
): Record<string, unknown>[] {
  const cols = visibleColumns(result, hiddenColumns);
  return result.rows.map((row, rowIndex) => {
    const obj: Record<string, unknown> = {};
    for (const c of cols) {
      const ov = cellOverride?.(rowIndex, c.name);
      obj[c.name] = ov !== undefined ? ov : (row[c.index] ?? null);
    }
    return obj;
  });
}

export function formatResultJson(
  result: QueryResult,
  hiddenColumns: string[] = [],
  cellOverride?: (rowIndex: number, column: string) => string | undefined,
): string {
  return JSON.stringify(rowsToJson(result, hiddenColumns, cellOverride), null, 2);
}

/**
 * Parse edited JSON and return cell edits vs current result (with overrides).
 * Does not allow adding/removing rows.
 */
export function diffJsonEdits(
  text: string,
  result: QueryResult,
  hiddenColumns: string[] = [],
  cellOverride?: (rowIndex: number, column: string) => string | undefined,
): { edits: JsonCellEdit[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid JSON" };
  }
  if (!Array.isArray(parsed)) {
    return { error: "JSON must be an array of row objects" };
  }
  if (parsed.length !== result.rows.length) {
    return {
      error: `Expected ${result.rows.length} row(s), got ${parsed.length}`,
    };
  }

  const cols = visibleColumns(result, hiddenColumns);
  const baseline = rowsToJson(result, hiddenColumns, cellOverride);
  const edits: JsonCellEdit[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { error: `Row ${i} must be an object` };
    }
    const obj = item as Record<string, unknown>;
    for (const c of cols) {
      if (!Object.prototype.hasOwnProperty.call(obj, c.name)) continue;
      const next = cellValueToEditString(obj[c.name]);
      const prev = cellValueToEditString(baseline[i][c.name]);
      if (next !== prev) {
        edits.push({ rowIndex: i, column: c.name, value: next });
      }
    }
  }

  return { edits };
}
