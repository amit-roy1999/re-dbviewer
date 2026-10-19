import type { QueryResult } from "@/types";

/** Workbench-like access cost band → fill color (white text). */
export type AccessBand =
  | "blue"
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "gray"
  | "join"
  | "op";

export type VisualExplainNode = {
  id: string;
  kind: "table" | "join" | "op";
  /** Short title inside the box (access label or join type). */
  title: string;
  /** Table / relation name under the box. */
  table?: string;
  /** Index / key used (bold under table). */
  key?: string;
  cost?: number;
  rows?: number;
  band: AccessBand;
  tip: string;
  children: VisualExplainNode[];
};

const BAND_COLORS: Record<AccessBand, { fill: string; tip: string }> = {
  blue: { fill: "#3b82f6", tip: "Very low cost (system / constant)" },
  green: { fill: "#16a34a", tip: "Low–medium cost (key / index lookup)" },
  yellow: { fill: "#ca8a04", tip: "Specialized fulltext search" },
  orange: { fill: "#ea580c", tip: "Medium cost (range / subquery)" },
  red: { fill: "#dc2626", tip: "High cost (full index or table scan)" },
  gray: { fill: "#475569", tip: "Unknown access type" },
  join: { fill: "#0f766e", tip: "Join operation" },
  op: { fill: "#64748b", tip: "Operation (sort, aggregate, …)" },
};

export function bandFill(band: AccessBand): string {
  return BAND_COLORS[band].fill;
}

export function bandTip(band: AccessBand): string {
  return BAND_COLORS[band].tip;
}

function mysqlBand(type: string): { band: AccessBand; title: string; tip: string } {
  const t = type.toLowerCase();
  const map: Record<string, { band: AccessBand; title: string }> = {
    system: { band: "blue", title: "Single row\n(system)" },
    const: { band: "blue", title: "Single row\n(constant)" },
    eq_ref: { band: "green", title: "Unique Key\nLookup" },
    ref: { band: "green", title: "Non-Unique Key\nLookup" },
    ref_or_null: { band: "green", title: "Key Lookup\n+ NULL" },
    index_merge: { band: "green", title: "Index Merge" },
    fulltext: { band: "yellow", title: "Fulltext\nIndex Search" },
    unique_subquery: { band: "orange", title: "Unique Key\n(subquery)" },
    index_subquery: { band: "orange", title: "Index Lookup\n(subquery)" },
    range: { band: "orange", title: "Index Range\nScan" },
    index: { band: "red", title: "Full Index\nScan" },
    all: { band: "red", title: "Full Table\nScan" },
  };
  const hit = map[t];
  if (hit) {
    return { ...hit, tip: bandTip(hit.band) };
  }
  return { band: "gray", title: type || "unknown", tip: bandTip("gray") };
}

function pgBand(nodeType: string): {
  kind: VisualExplainNode["kind"];
  band: AccessBand;
  title: string;
} {
  const t = nodeType.toLowerCase();
  if (t.includes("nested loop") || t.includes("hash join") || t.includes("merge join")) {
    return { kind: "join", band: "join", title: nodeType };
  }
  if (
    t.includes("sort") ||
    t.includes("aggregate") ||
    t.includes("hash") ||
    t.includes("limit") ||
    t.includes("materialize") ||
    t.includes("gather") ||
    t.includes("append") ||
    t.includes("unique") ||
    t.includes("window")
  ) {
    return { kind: "op", band: "op", title: nodeType };
  }
  if (t.includes("seq scan")) {
    return { kind: "table", band: "red", title: "Full Table Scan" };
  }
  if (t.includes("index only")) {
    return { kind: "table", band: "green", title: "Index Only Scan" };
  }
  if (t.includes("index scan") || t.includes("index")) {
    return { kind: "table", band: "green", title: "Index Scan" };
  }
  if (t.includes("bitmap")) {
    return { kind: "table", band: "orange", title: nodeType };
  }
  return { kind: "table", band: "gray", title: nodeType };
}

type PgNode = {
  "Node Type"?: string;
  "Relation Name"?: string;
  "Index Name"?: string;
  Alias?: string;
  "Total Cost"?: number;
  "Plan Rows"?: number;
  "Actual Total Time"?: number;
  Plans?: PgNode[];
  Plan?: PgNode;
};

let idSeq = 0;
function nid() {
  idSeq += 1;
  return `n${idSeq}`;
}

function fromPg(n: PgNode): VisualExplainNode {
  const type = n["Node Type"] ?? "Plan";
  const meta = pgBand(type);
  return {
    id: nid(),
    kind: meta.kind,
    title: meta.title,
    table: n["Relation Name"] ?? n.Alias,
    key: n["Index Name"],
    cost: n["Total Cost"] ?? n["Actual Total Time"],
    rows: n["Plan Rows"],
    band: meta.band,
    tip: bandTip(meta.band),
    children: (n.Plans ?? []).map(fromPg),
  };
}

function tryPgJson(result: QueryResult): VisualExplainNode[] | null {
  let raw = result.rows[0]?.[0];
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!(t.startsWith("[") || t.startsWith("{"))) return null;
    try {
      raw = JSON.parse(t);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const roots = Array.isArray(raw) ? raw : [raw];
  const out: VisualExplainNode[] = [];
  for (const r of roots as PgNode[]) {
    const plan = r?.Plan ?? r;
    if (plan && ("Node Type" in plan || "Plans" in plan)) out.push(fromPg(plan));
  }
  return out.length ? out : null;
}

function tryMysql(result: QueryResult): VisualExplainNode[] | null {
  const cols = result.columns.map((c) => c.toLowerCase());
  const ti = cols.indexOf("table");
  const ty = cols.indexOf("type");
  if (ti < 0) return null;
  const ri = cols.indexOf("rows");
  const ki = cols.indexOf("key");
  const fi = cols.indexOf("filtered");
  const ei = cols.indexOf("extra");
  const si = cols.indexOf("select_type");
  const ii = cols.indexOf("id");

  // Build a simple join chain: consecutive rows under nested-loop style parent
  const leaves: VisualExplainNode[] = [];
  for (const row of result.rows) {
    const access = String(row[ty] ?? "ALL");
    const { band, title, tip } = mysqlBand(access);
    const table = String(row[ti] ?? "");
    const key = ki >= 0 && row[ki] != null ? String(row[ki]) : undefined;
    const rows = ri >= 0 ? Number(row[ri]) : undefined;
    const filtered = fi >= 0 ? Number(row[fi]) : undefined;
    const cost =
      typeof rows === "number" && Number.isFinite(rows)
        ? rows * (Number.isFinite(filtered) ? (100 - (filtered as number)) / 100 + 0.01 : 1)
        : undefined;
    const extra = ei >= 0 && row[ei] != null ? String(row[ei]) : "";
    const selectType = si >= 0 ? String(row[si] ?? "") : "";
    leaves.push({
      id: nid(),
      kind: "table",
      title,
      table: table || selectType || undefined,
      key,
      cost: cost != null && Number.isFinite(cost) ? Math.round(cost * 100) / 100 : undefined,
      rows: Number.isFinite(rows as number) ? (rows as number) : undefined,
      band,
      tip: extra ? `${tip}\n${extra}` : tip,
      children: [],
    });
  }
  if (!leaves.length) return null;
  if (leaves.length === 1) return leaves;
  // Single n-ary nested-loop node — keeps Visual Explain compact.
  void ii;
  return [
    {
      id: nid(),
      kind: "join",
      title: "nested loop",
      band: "join",
      tip: `Nested loop join (${leaves.length} tables)`,
      rows: leaves[leaves.length - 1]?.rows,
      children: leaves,
    },
  ];
}

function trySqlite(result: QueryResult): VisualExplainNode[] | null {
  const cols = result.columns.map((c) => c.toLowerCase());
  const di = cols.indexOf("detail");
  const ii = cols.indexOf("id");
  const pi = cols.indexOf("parent");
  if (di < 0 || ii < 0 || pi < 0) return null;
  const byId = new Map<number, VisualExplainNode>();
  const roots: VisualExplainNode[] = [];
  for (const row of result.rows) {
    const detail = String(row[di] ?? "");
    const lower = detail.toLowerCase();
    let band: AccessBand = "gray";
    let title = detail;
    if (lower.includes("scan")) {
      band = "red";
      title = "Full Table Scan";
    } else if (lower.includes("search") || lower.includes("using index")) {
      band = "green";
      title = "Index Lookup";
    } else if (lower.includes("cover")) {
      band = "green";
      title = "Covering Index";
    }
    const tableMatch = detail.match(/\b(?:FROM|TABLE|ON)\s+(\w+)/i);
    const node: VisualExplainNode = {
      id: nid(),
      kind: "table",
      title,
      table: tableMatch?.[1] ?? detail,
      band,
      tip: bandTip(band),
      children: [],
    };
    byId.set(Number(row[ii]), node);
    const parent = byId.get(Number(row[pi]));
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

function tryIndented(result: QueryResult): VisualExplainNode[] | null {
  if (result.columns.length !== 1) return null;
  const roots: VisualExplainNode[] = [];
  const stack: { indent: number; node: VisualExplainNode }[] = [];
  for (const row of result.rows) {
    const line = String(row[0] ?? "");
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const text = line.trim().replace(/^->\s*/, "");
    const costM = text.match(/\bcost=([\d.]+)/i);
    const rowsM = text.match(/\brows=([\d.]+)/i);
    const lower = text.toLowerCase();
    let band: AccessBand = "gray";
    let kind: VisualExplainNode["kind"] = "op";
    let title = text.split("(")[0].trim() || text;
    if (lower.includes("nested loop") || lower.includes("hash join")) {
      kind = "join";
      band = "join";
    } else if (lower.includes("table scan") || lower.includes("all ")) {
      kind = "table";
      band = "red";
      title = "Full Table Scan";
    } else if (lower.includes("index")) {
      kind = "table";
      band = "green";
    } else if (lower.includes("range")) {
      kind = "table";
      band = "orange";
    }
    const node: VisualExplainNode = {
      id: nid(),
      kind,
      title,
      cost: costM ? Number(costM[1]) : undefined,
      rows: rowsM ? Number(rowsM[1]) : undefined,
      band,
      tip: bandTip(band),
      children: [],
    };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
    stack.push({ indent, node });
  }
  return roots.length ? roots : null;
}

/** Build a Workbench-style visual explain tree from an EXPLAIN QueryResult. */
export function buildVisualExplain(result: QueryResult): VisualExplainNode[] {
  idSeq = 0;
  return (
    tryPgJson(result) ??
    tryMysql(result) ??
    trySqlite(result) ??
    tryIndented(result) ??
    []
  );
}

export const ACCESS_LEGEND: { band: AccessBand; label: string }[] = [
  { band: "blue", label: "const / system" },
  { band: "green", label: "ref / index lookup" },
  { band: "yellow", label: "fulltext" },
  { band: "orange", label: "range / subquery" },
  { band: "red", label: "ALL / full scan" },
  { band: "join", label: "join" },
  { band: "op", label: "operation" },
];
