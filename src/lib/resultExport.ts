import type { QueryResult } from "@/types";

export type ExportFormat = "csv" | "json" | "markdown" | "inserts";

export const EXPORT_FORMATS: {
  id: ExportFormat;
  label: string;
  ext: string;
}[] = [
  { id: "csv", label: "CSV", ext: "csv" },
  { id: "json", label: "JSON", ext: "json" },
  { id: "markdown", label: "Markdown", ext: "md" },
  { id: "inserts", label: "SQL INSERTs", ext: "sql" },
];

export function resultToJson(result: QueryResult): string {
  const objs = result.rows.map((row) => {
    const o: Record<string, unknown> = {};
    result.columns.forEach((c, i) => {
      o[c] = row[i] ?? null;
    });
    return o;
  });
  return JSON.stringify(objs, null, 2);
}

function mdCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function resultToMarkdown(result: QueryResult): string {
  if (!result.columns.length) return "";
  const head = `| ${result.columns.map(mdCell).join(" | ")} |`;
  const sep = `| ${result.columns.map(() => "---").join(" | ")} |`;
  const body = result.rows.map(
    (row) => `| ${result.columns.map((_, i) => mdCell(row[i])).join(" | ")} |`,
  );
  return [head, sep, ...body].join("\n");
}

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return `'${s.replace(/'/g, "''")}'`;
}

function quoteIdent(engine: string, name: string): string {
  const q = engine === "mysql" || engine === "mariadb" ? "`" : '"';
  return `${q}${name.replace(new RegExp(q, "g"), q + q)}${q}`;
}

export function resultToInserts(
  result: QueryResult,
  table: string,
  engine: string,
): string {
  if (!result.columns.length) return "";
  const t = table
    .split(".")
    .map((p) => quoteIdent(engine, p))
    .join(".");
  const cols = result.columns.map((c) => quoteIdent(engine, c)).join(", ");
  return result.rows
    .map(
      (row) =>
        `INSERT INTO ${t} (${cols}) VALUES (${result.columns
          .map((_, i) => sqlValue(row[i]))
          .join(", ")});`,
    )
    .join("\n");
}

export function formatResult(
  fmt: ExportFormat,
  result: QueryResult,
  table: string,
  engine: string,
  csv: (r: QueryResult) => string,
): string {
  switch (fmt) {
    case "json":
      return resultToJson(result);
    case "markdown":
      return resultToMarkdown(result);
    case "inserts":
      return resultToInserts(result, table, engine);
    default:
      return csv(result);
  }
}
