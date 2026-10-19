import type { QueryResult } from "@/types";

export type PlanNode = {
  label: string;
  detail?: string;
  children: PlanNode[];
};

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

function pgToNode(n: PgNode): PlanNode {
  const type = n["Node Type"] ?? "Plan";
  const rel = n["Relation Name"] ?? n.Alias;
  const bits: string[] = [];
  if (n["Index Name"]) bits.push(`idx ${n["Index Name"]}`);
  if (typeof n["Total Cost"] === "number") bits.push(`cost ${n["Total Cost"]}`);
  if (typeof n["Plan Rows"] === "number") bits.push(`rows ${n["Plan Rows"]}`);
  if (typeof n["Actual Total Time"] === "number")
    bits.push(`${n["Actual Total Time"]} ms`);
  return {
    label: rel ? `${type} · ${rel}` : type,
    detail: bits.join(" · ") || undefined,
    children: (n.Plans ?? []).map(pgToNode),
  };
}

function tryPgJson(result: QueryResult): PlanNode[] | null {
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
  const out: PlanNode[] = [];
  for (const r of roots as PgNode[]) {
    const plan = r?.Plan ?? r;
    if (plan && ("Node Type" in plan || "Plans" in plan)) out.push(pgToNode(plan));
  }
  return out.length ? out : null;
}

/** SQLite `EXPLAIN QUERY PLAN`: id / parent / detail. */
function trySqlite(result: QueryResult): PlanNode[] | null {
  const cols = result.columns.map((c) => c.toLowerCase());
  const di = cols.indexOf("detail");
  const ii = cols.indexOf("id");
  const pi = cols.indexOf("parent");
  if (di < 0 || ii < 0 || pi < 0) return null;
  const byId = new Map<number, PlanNode>();
  const roots: PlanNode[] = [];
  for (const row of result.rows) {
    const node: PlanNode = { label: String(row[di] ?? ""), children: [] };
    byId.set(Number(row[ii]), node);
    const parent = byId.get(Number(row[pi]));
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

/** MySQL tabular EXPLAIN: one node per row, grouped under select_type / id. */
function tryMysql(result: QueryResult): PlanNode[] | null {
  const cols = result.columns.map((c) => c.toLowerCase());
  const ti = cols.indexOf("table");
  const si = cols.indexOf("select_type");
  if (ti < 0 || si < 0) return null;
  const ii = cols.indexOf("id");
  const ty = cols.indexOf("type");
  const ri = cols.indexOf("rows");
  const ki = cols.indexOf("key");
  const groups = new Map<string, PlanNode>();
  const roots: PlanNode[] = [];
  for (const row of result.rows) {
    const id = String(row[ii] ?? "1");
    let g = groups.get(id);
    if (!g) {
      g = { label: `${row[si] ?? "SELECT"} (id ${id})`, children: [] };
      groups.set(id, g);
      roots.push(g);
    }
    const bits = [
      ty >= 0 && row[ty] != null ? `type ${row[ty]}` : "",
      ki >= 0 && row[ki] != null ? `key ${row[ki]}` : "",
      ri >= 0 && row[ri] != null ? `rows ${row[ri]}` : "",
    ].filter(Boolean);
    g.children.push({
      label: String(row[ti] ?? "(no table)"),
      detail: bits.join(" · ") || undefined,
      children: [],
    });
  }
  return roots;
}

/** Postgres/MSSQL text plans: indentation (and `->`) defines depth. */
function tryIndented(result: QueryResult): PlanNode[] | null {
  if (result.columns.length !== 1) return null;
  const roots: PlanNode[] = [];
  const stack: { indent: number; node: PlanNode }[] = [];
  for (const row of result.rows) {
    const line = String(row[0] ?? "");
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const node: PlanNode = {
      label: line.trim().replace(/^->\s*/, ""),
      children: [],
    };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
    stack.push({ indent, node });
  }
  return roots.length ? roots : null;
}

export function parseExplainTree(result: QueryResult): PlanNode[] {
  return (
    tryPgJson(result) ??
    trySqlite(result) ??
    tryMysql(result) ??
    tryIndented(result) ??
    result.rows.map((r) => ({
      label: r.map((c) => (c == null ? "" : String(c))).filter(Boolean).join(" · "),
      children: [],
    }))
  );
}

function NodeView({ node, accent }: { node: PlanNode; accent: string }) {
  return (
    <li>
      <div className="flex items-baseline gap-2 py-0.5">
        <span
          className="size-1.5 shrink-0 translate-y-[-1px] rounded-full"
          style={{ backgroundColor: accent }}
        />
        <span className="font-mono text-[11px]" title={node.label}>
          {node.label}
        </span>
        {node.detail ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {node.detail}
          </span>
        ) : null}
      </div>
      {node.children.length ? (
        <ul className="ml-1 border-l border-border pl-3">
          {node.children.map((c, i) => (
            <NodeView key={i} node={c} accent={accent} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ExplainTree({
  result,
  accent = "#0f766e",
}: {
  result: QueryResult;
  accent?: string;
}) {
  const roots = parseExplainTree(result);
  if (roots.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground">No plan to show.</div>
    );
  }
  return (
    <div className="px-3 py-3">
      <p className="mb-2 text-[11px] text-muted-foreground">Plan tree</p>
      <ul>
        {roots.map((n, i) => (
          <NodeView key={i} node={n} accent={accent} />
        ))}
      </ul>
    </div>
  );
}
