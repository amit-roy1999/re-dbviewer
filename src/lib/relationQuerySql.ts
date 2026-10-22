import { quoteIdent, shortName, sqlLiteral } from "@/lib/dbApi";
import type { FilterOp } from "@/types";
import {
  edgeBetween,
  joinOrder,
  type RelationEdge,
  type RelationGraph,
} from "@/lib/relationGraph";

/** Quote a result-column alias that may contain dots (`table.column`). */
function quoteResultAlias(engine: string, alias: string): string {
  const q = engine === "mysql" || engine === "mariadb" ? "`" : '"';
  return `${q}${alias.split(q).join(q + q)}${q}`;
}

export type JoinType = "LEFT" | "INNER";

export type SelectedColumns = Record<string, string[]>; // nodeId -> column names

export type RelationFilter = {
  id: string;
  nodeId: string;
  column: string;
  op: FilterOp;
  value?: string;
  /** How this row joins the previous one. Ignored on the first emitted predicate. */
  join?: "and" | "or";
};

export type BuildRelationSelectArgs = {
  graph: RelationGraph;
  engine: string;
  joinType: JoinType;
  /** Columns per node id. Empty overall → root.* */
  selected: SelectedColumns;
  filters?: RelationFilter[];
};

const OP_SQL: Record<Exclude<FilterOp, "is_null" | "is_not_null">, string> = {
  eq: "=",
  ne: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  like: "LIKE",
};

function onClause(
  engine: string,
  edge: RelationEdge,
  aliasById: Map<string, string>,
): string {
  const ownerAlias = aliasById.get(edge.fkOwnerId)!;
  const otherId =
    edge.fkOwnerId === edge.fromId ? edge.toId : edge.fromId;
  const otherAlias = aliasById.get(otherId)!;
  const parts: string[] = [];
  for (let i = 0; i < edge.fk.columns.length; i++) {
    const left = `${ownerAlias}.${quoteIdent(engine, edge.fk.columns[i])}`;
    const right = `${otherAlias}.${quoteIdent(engine, edge.fk.refColumns[i] ?? edge.fk.refColumns[0])}`;
    parts.push(`${left} = ${right}`);
  }
  return parts.join(" AND ");
}

/** Build one predicate; null if incomplete / node not in join. */
export function filterPredicate(
  f: RelationFilter,
  engine: string,
  aliasById: Map<string, string>,
): string | null {
  if (!f.column.trim()) return null;
  const alias = aliasById.get(f.nodeId);
  if (!alias) return null;
  const col = `${alias}.${quoteIdent(engine, f.column)}`;
  if (f.op === "is_null") return `${col} IS NULL`;
  if (f.op === "is_not_null") return `${col} IS NOT NULL`;
  if (f.value === undefined || f.value === null) return null;
  const sqlOp = OP_SQL[f.op];
  if (!sqlOp) return null;
  return `${col} ${sqlOp} ${sqlLiteral(f.value, engine)}`;
}

export function buildWhereClause(
  filters: RelationFilter[] | undefined,
  engine: string,
  aliasById: Map<string, string>,
): string {
  if (!filters?.length) return "";
  const parts: string[] = [];
  for (const f of filters) {
    const pred = filterPredicate(f, engine, aliasById);
    if (!pred) continue;
    if (!parts.length) {
      parts.push(pred);
    } else {
      const kw = f.join === "or" ? "OR" : "AND";
      parts.push(`${kw} ${pred}`);
    }
  }
  if (!parts.length) return "";
  return `WHERE ${parts.join(" ")}`;
}

/**
 * Build SELECT … JOIN SQL from an included relation graph.
 */
export function buildRelationSelect(args: BuildRelationSelectArgs): string {
  const { graph, engine, joinType, selected, filters } = args;
  const order = joinOrder(graph);
  if (!order.length) return "";

  const aliasById = new Map<string, string>();
  order.forEach((id, i) => aliasById.set(id, `t${i}`));

  const root = graph.nodes.find((n) => n.id === graph.rootId)!;
  const rootAlias = aliasById.get(graph.rootId)!;

  const selectParts: string[] = [];
  for (const id of order) {
    const cols = selected[id] ?? [];
    const alias = aliasById.get(id)!;
    const node = graph.nodes.find((n) => n.id === id);
    const tableLabel = node?.name ?? shortName(node?.ref ?? id);
    for (const c of cols) {
      const resultAlias = `${tableLabel}.${c}`;
      selectParts.push(
        `${alias}.${quoteIdent(engine, c)} AS ${quoteResultAlias(engine, resultAlias)}`,
      );
    }
  }
  if (!selectParts.length) {
    selectParts.push(`${rootAlias}.*`);
  }

  const lines: string[] = [];
  lines.push(`SELECT`);
  lines.push(`  ${selectParts.join(",\n  ")}`);
  lines.push(`FROM ${quoteIdent(engine, root.ref)} ${rootAlias}`);

  const joined = new Set<string>([graph.rootId]);
  for (const id of order) {
    if (id === graph.rootId) continue;
    let edge: RelationEdge | undefined;
    let parentId: string | undefined;
    for (const j of joined) {
      const e = edgeBetween(graph, j, id);
      if (e) {
        edge = e;
        parentId = j;
        break;
      }
    }
    if (!edge || !parentId) continue;
    const node = graph.nodes.find((n) => n.id === id)!;
    const alias = aliasById.get(id)!;
    const on = onClause(engine, edge, aliasById);
    lines.push(
      `${joinType} JOIN ${quoteIdent(engine, node.ref)} ${alias} ON ${on}`,
    );
    joined.add(id);
  }

  const where = buildWhereClause(filters, engine, aliasById);
  if (where) lines.push(where);

  return lines.join("\n") + "\n";
}
