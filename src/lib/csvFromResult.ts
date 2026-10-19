import type { QueryResult } from "@/types";

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvFromResult(result: QueryResult): string {
  const header = result.columns.map(esc).join(",");
  const lines = result.rows.map((row) =>
    result.columns.map((_, i) => esc(row[i])).join(","),
  );
  return [header, ...lines].join("\n");
}
