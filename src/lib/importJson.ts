import { quoteIdent, sqlLiteral } from "@/lib/dbApi";

/**
 * JSON array of objects -> chunked INSERTs. Keys are matched to table columns
 * case-insensitively; keys that match no column are ignored (and reported).
 */
export function jsonToInserts(
  table: string,
  text: string,
  engine: string,
  tableColumns: string[],
  chunk = 200,
): { statements: string[]; rows: number; ignoredKeys: string[] } {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data) || data.length === 0)
    throw new Error("Expected a non-empty JSON array of objects.");
  const rows = data.map((r) => {
    if (!r || typeof r !== "object" || Array.isArray(r))
      throw new Error("Every array item must be a JSON object.");
    return r as Record<string, unknown>;
  });
  const byLower = new Map(tableColumns.map((c) => [c.toLowerCase(), c]));
  const keyToCol = new Map<string, string>();
  const ignored = new Set<string>();
  for (const r of rows)
    for (const k of Object.keys(r)) {
      const col = byLower.get(k.toLowerCase());
      if (col) keyToCol.set(k, col);
      else ignored.add(k);
    }
  if (keyToCol.size === 0) throw new Error("No JSON keys match the table's columns.");
  const keys = [...keyToCol.keys()];
  const head = `INSERT INTO ${quoteIdent(engine, table)} (${keys
    .map((k) => quoteIdent(engine, keyToCol.get(k)!))
    .join(", ")}) VALUES\n`;
  const statements: string[] = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const values = rows
      .slice(i, i + chunk)
      .map((r) => `(${keys.map((k) => sqlLiteral(r[k], engine)).join(", ")})`);
    statements.push(head + values.join(",\n"));
  }
  return { statements, rows: rows.length, ignoredKeys: [...ignored] };
}
