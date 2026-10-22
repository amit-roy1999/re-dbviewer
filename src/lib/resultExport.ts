import type { QueryResult } from "@/types";
import { formatCellDisplay } from "@/lib/cellFormat";

export type ExportFormat =
  | "csv"
  | "json"
  | "markdown"
  | "inserts"
  | "xlsx"
  | "html"
  | "xml";

export const EXPORT_FORMATS: {
  id: ExportFormat;
  label: string;
  ext: string;
}[] = [
  { id: "csv", label: "CSV", ext: "csv" },
  { id: "xlsx", label: "Excel", ext: "xlsx" },
  { id: "json", label: "JSON", ext: "json" },
  { id: "markdown", label: "Markdown", ext: "md" },
  { id: "html", label: "HTML table", ext: "html" },
  { id: "xml", label: "XML", ext: "xml" },
  { id: "inserts", label: "SQL INSERTs", ext: "sql" },
];

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellStr(v: unknown): string {
  return formatCellDisplay(v);
}

export function resultToHtml(result: QueryResult): string {
  const th = result.columns
    .map((c) => `<th>${escXml(c)}</th>`)
    .join("");
  const body = result.rows
    .map(
      (row) =>
        `<tr>${result.columns
          .map((_, i) => `<td>${escXml(cellStr(row[i]))}</td>`)
          .join("")}</tr>`,
    )
    .join("\n");
  return `<table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>\n`;
}

export function resultToXml(result: QueryResult): string {
  const rows = result.rows
    .map((row) => {
      const cells = result.columns
        .map(
          (c, i) =>
            `    <${escXml(c.replace(/\W+/g, "_") || "col")}>${escXml(cellStr(row[i]))}</${escXml(c.replace(/\W+/g, "_") || "col")}>`,
        )
        .join("\n");
      return `  <row>\n${cells}\n  </row>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<result>\n${rows}\n</result>\n`;
}

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
  return formatCellDisplay(v).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
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
  const s = formatCellDisplay(v);
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
    case "html":
      return resultToHtml(result);
    case "xml":
      return resultToXml(result);
    case "inserts":
      return resultToInserts(result, table, engine);
    case "xlsx":
      throw new Error("xlsx is binary — use resultToXlsxBuffer");
    default:
      return csv(result);
  }
}
