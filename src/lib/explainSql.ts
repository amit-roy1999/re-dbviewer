import type { QueryResult } from "@/types";

/** True when the statement is a read that is safe for EXPLAIN ANALYZE. */
export function isReadSql(sql: string): boolean {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  const lower = trimmed.replace(/^\/\*[\s\S]*?\*\//, "").trimStart().toLowerCase();
  return (
    lower.startsWith("select") ||
    lower.startsWith("with") ||
    lower.startsWith("values")
  );
}

export function stripTrailingSemi(sql: string): string {
  return sql.trim().replace(/;+\s*$/, "");
}

/**
 * Build engine-specific EXPLAIN SQL. Throws a user-facing Error for unsupported engines.
 */
export function buildExplainSql(
  engine: string,
  sql: string,
  analyze: boolean,
): string {
  const body = stripTrailingSemi(sql);
  if (!body) throw new Error("Write a query before Explain");

  switch (engine) {
    case "sqlite":
      // ANALYZE not available for QUERY PLAN
      return `EXPLAIN QUERY PLAN ${body}`;
    case "mysql":
    case "mariadb":
      return analyze ? `EXPLAIN ANALYZE ${body}` : `EXPLAIN ${body}`;
    case "postgres":
      return analyze
        ? `EXPLAIN (ANALYZE, FORMAT JSON) ${body}`
        : `EXPLAIN (FORMAT JSON) ${body}`;
    case "mssql":
      throw new Error("Explain is not supported for SQL Server yet");
    default:
      throw new Error(`Explain is not supported for engine: ${engine}`);
  }
}

export type ExplainStep = {
  label: string;
  value: number;
  metric: string;
};

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function cellNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Pull a cost / time / rows number out of free-form EXPLAIN text. */
function parseEmbeddedMetric(text: string): { value: number; metric: string } | null {
  const cost = text.match(/\bcost\s*=\s*([\d.]+)/i);
  if (cost) {
    const n = Number(cost[1]);
    if (Number.isFinite(n)) return { value: n, metric: "cost" };
  }
  const actual = text.match(/\bactual\s+time\s*=\s*[\d.]+\.\.([\d.]+)/i);
  if (actual) {
    const n = Number(actual[1]);
    if (Number.isFinite(n)) return { value: n, metric: "ms" };
  }
  const rows = text.match(/\brows\s*=\s*([\d.]+)/i);
  if (rows) {
    const n = Number(rows[1]);
    if (Number.isFinite(n)) return { value: n, metric: "rows" };
  }
  return null;
}

type PgPlanNode = {
  "Node Type"?: string;
  "Relation Name"?: string;
  Alias?: string;
  "Total Cost"?: number;
  "Plan Rows"?: number;
  "Actual Total Time"?: number;
  Plans?: PgPlanNode[];
  Plan?: PgPlanNode;
};

function flattenPgPlan(node: PgPlanNode, out: ExplainStep[]) {
  const type = node["Node Type"] ?? "Plan";
  const rel = node["Relation Name"] ?? node.Alias ?? "";
  const label = rel ? `${type} · ${rel}` : type;
  const actual = node["Actual Total Time"];
  const cost = node["Total Cost"];
  const rows = node["Plan Rows"];
  if (typeof actual === "number") {
    out.push({ label, value: actual, metric: "ms" });
  } else if (typeof cost === "number") {
    out.push({ label, value: cost, metric: "cost" });
  } else if (typeof rows === "number") {
    out.push({ label, value: rows, metric: "rows" });
  } else {
    out.push({ label, value: 1, metric: "step" });
  }
  for (const child of node.Plans ?? []) {
    flattenPgPlan(child, out);
  }
}

function tryParsePostgresJson(result: QueryResult): ExplainStep[] | null {
  if (result.rows.length === 0) return null;
  // FORMAT JSON: one cell that is a JSON string, array, or object
  const raw = result.rows[0]?.[0];
  if (raw === null || raw === undefined) return null;

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!(trimmed.startsWith("[") || trimmed.startsWith("{"))) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
  } else if (typeof raw !== "object") {
    return null;
  }

  const roots = Array.isArray(parsed) ? parsed : [parsed];
  const steps: ExplainStep[] = [];
  for (const root of roots) {
    if (!root || typeof root !== "object") continue;
    const plan = (root as PgPlanNode).Plan ?? (root as PgPlanNode);
    if (plan && typeof plan === "object" && ("Node Type" in plan || "Plans" in plan || "Total Cost" in plan)) {
      flattenPgPlan(plan, steps);
    } else if ((root as PgPlanNode).Plan) {
      flattenPgPlan((root as PgPlanNode).Plan as PgPlanNode, steps);
    }
  }
  return steps.length ? steps : null;
}

/** SQLite QUERY PLAN: label = detail, weight by nesting depth (or equal). */
function tryParseSqlitePlan(result: QueryResult): ExplainStep[] | null {
  const cols = result.columns.map((c) => c.toLowerCase());
  const detailIdx = cols.findIndex((c) => c === "detail");
  if (detailIdx < 0) return null;
  const parentIdx = cols.findIndex((c) => c === "parent");
  const idIdx = cols.findIndex((c) => c === "id" || c === "selectid");

  return result.rows.slice(0, 40).map((row, i) => {
    const label = cellStr(row[detailIdx]) || `Step ${i + 1}`;
    let depth = 0;
    if (parentIdx >= 0 && idIdx >= 0) {
      const parent = cellNum(row[parentIdx]) ?? 0;
      // shallower roots (parent 0) weigh more; nested steps lighter
      depth = parent === 0 ? 3 : 1;
    } else {
      depth = 1;
    }
    return { label, value: depth, metric: "weight" };
  });
}

/** Extract chart steps from an EXPLAIN QueryResult (engine-agnostic heuristics + PG JSON). */
export function parseExplainSteps(result: QueryResult): ExplainStep[] {
  const fromPg = tryParsePostgresJson(result);
  if (fromPg) return fromPg.slice(0, 40);

  const fromSqlite = tryParseSqlitePlan(result);
  if (fromSqlite) return fromSqlite;

  const cols = result.columns.map((c) => c.toLowerCase());
  const preferValue = [
    "total cost",
    "total_cost",
    "cost",
    "estimate",
    "actual total time",
    "actual_time",
    "rows",
  ];
  let valueIdx = -1;
  let metric = "value";
  for (const name of preferValue) {
    const i = cols.findIndex(
      (c) => c === name || c.replace(/\s+/g, "_") === name.replace(/\s+/g, "_"),
    );
    if (i >= 0) {
      valueIdx = i;
      metric = result.columns[i] ?? name;
      break;
    }
  }
  if (valueIdx < 0) {
    for (let i = 0; i < result.columns.length; i++) {
      if (
        result.rows.length > 0 &&
        result.rows.every((r) => cellNum(r[i]) !== null)
      ) {
        // Skip opaque id-like first columns when a later text column exists
        const name = cols[i] ?? "";
        if (name === "id" || name === "selectid" || name === "parent" || name === "notused") {
          continue;
        }
        valueIdx = i;
        metric = result.columns[i] ?? "value";
        break;
      }
    }
  }

  const preferLabel = [
    "detail",
    "operation",
    "node type",
    "select_type",
    "table",
    "extra",
    "query plan",
    "explain",
  ];
  let labelIdx = -1;
  for (const name of preferLabel) {
    const i = cols.findIndex((c) => c === name || c.includes(name));
    if (i >= 0 && i !== valueIdx) {
      labelIdx = i;
      break;
    }
  }
  if (labelIdx < 0) {
    // Prefer first string-ish column
    for (let i = 0; i < result.columns.length; i++) {
      if (i === valueIdx) continue;
      if (result.rows.some((r) => typeof r[i] === "string" && cellStr(r[i]))) {
        labelIdx = i;
        break;
      }
    }
  }
  if (labelIdx < 0) {
    labelIdx = result.columns.findIndex((_, i) => i !== valueIdx);
  }

  // Single text column (MySQL ANALYZE tree / PG TEXT): try embedded metrics
  if (
    result.columns.length === 1 &&
    result.rows.every((r) => typeof r[0] === "string" || r[0] === null)
  ) {
    return result.rows.slice(0, 40).map((row, i) => {
      const label = cellStr(row[0]) || `Step ${i + 1}`;
      const embedded = parseEmbeddedMetric(label);
      return {
        label: label.trim(),
        value: embedded?.value ?? Math.max(1, 40 - i),
        metric: embedded?.metric ?? "step",
      };
    });
  }

  return result.rows.slice(0, 40).map((row, i) => {
    const label =
      labelIdx >= 0 && cellStr(row[labelIdx])
        ? cellStr(row[labelIdx])
        : `Step ${i + 1}`;
    if (valueIdx >= 0) {
      const n = cellNum(row[valueIdx]);
      return { label, value: Math.max(0, n ?? 1), metric };
    }
    const embedded = parseEmbeddedMetric(label);
    if (embedded) {
      return { label, value: embedded.value, metric: embedded.metric };
    }
    return { label, value: Math.max(1, 40 - i), metric: "step" };
  });
}
