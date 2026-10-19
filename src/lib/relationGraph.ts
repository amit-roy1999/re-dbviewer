import type { ForeignKeyInfo, TableDetails } from "@/types";
import { shortName } from "@/lib/dbApi";
import type { InboundFk } from "@/lib/relationInbound";

export type RelationDirection = "out" | "in";

export type RelationNode = {
  id: string;
  ref: string;
  name: string;
  details: TableDetails | null;
  /** Included in the generated query. Root is always included. */
  included: boolean;
  /** Neighbors of this node have been loaded. */
  expanded: boolean;
  isRoot: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type RelationEdge = {
  id: string;
  fromId: string;
  toId: string;
  /** Table that owns the FK columns. */
  fkOwnerId: string;
  fk: ForeignKeyInfo;
  direction: RelationDirection;
};

export type RelationGraph = {
  rootId: string;
  nodes: RelationNode[];
  edges: RelationEdge[];
};

export const REL_BOX_W = 200;
const HEAD = 28;
const ROW = 16;
const GAP_X = 48;
const GAP_Y = 28;

export function nodeIdFor(ref: string) {
  return ref.toLowerCase();
}

export function createRootNode(ref: string, details: TableDetails): RelationNode {
  return {
    id: nodeIdFor(ref),
    ref,
    name: shortName(ref),
    details,
    included: true,
    expanded: true,
    isRoot: true,
    x: 0,
    y: 0,
    w: REL_BOX_W,
    h: HEAD + ROW * Math.min(8, Math.max(1, details.columns.length)) + 8,
  };
}

export function emptyGraph(root: RelationNode): RelationGraph {
  return { rootId: root.id, nodes: [root], edges: [] };
}

function resolveNeighborRef(
  fromRef: string,
  fkRefTable: string,
): string {
  if (fkRefTable.includes(".")) return fkRefTable;
  const parts = fromRef.split(".");
  if (parts.length >= 2) {
    return `${parts.slice(0, -1).join(".")}.${fkRefTable}`;
  }
  return fkRefTable;
}

/** Add outbound + inbound neighbors around `centerId` (skip existing). */
export function addNeighbors(
  graph: RelationGraph,
  centerId: string,
  outbound: ForeignKeyInfo[],
  inbound: InboundFk[],
  detailsByRef: Record<string, TableDetails>,
): RelationGraph {
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const center = byId.get(centerId);
  if (!center) return graph;

  const ensureNode = (ref: string): RelationNode => {
    const id = nodeIdFor(ref);
    let n = byId.get(id);
    if (!n) {
      const details = detailsByRef[ref] ?? detailsByRef[shortName(ref)] ?? null;
      n = {
        id,
        ref,
        name: shortName(ref),
        details,
        included: false,
        expanded: false,
        isRoot: false,
        x: 0,
        y: 0,
        w: REL_BOX_W,
        h:
          HEAD +
          ROW * Math.min(8, Math.max(1, details?.columns.length ?? 1)) +
          8,
      };
      byId.set(id, n);
      nodes.push(n);
    } else if (!n.details && detailsByRef[ref]) {
      n = {
        ...n,
        details: detailsByRef[ref],
        h:
          HEAD +
          ROW * Math.min(8, Math.max(1, detailsByRef[ref].columns.length)) +
          8,
      };
      byId.set(id, n);
      const idx = nodes.findIndex((x) => x.id === id);
      if (idx >= 0) nodes[idx] = n;
    }
    return byId.get(id)!;
  };

  for (const fk of outbound) {
    const neighborRef = resolveNeighborRef(center.ref, fk.refTable);
    const neighbor = ensureNode(neighborRef);
    const edgeId = `out:${center.id}:${neighbor.id}:${fk.name}`;
    if (!edges.some((e) => e.id === edgeId)) {
      edges.push({
        id: edgeId,
        fromId: center.id,
        toId: neighbor.id,
        fkOwnerId: center.id,
        fk,
        direction: "out",
      });
    }
  }

  for (const fk of inbound) {
    const neighborRef = fk.fromTable;
    const neighbor = ensureNode(neighborRef);
    const edgeId = `in:${neighbor.id}:${center.id}:${fk.name}`;
    if (!edges.some((e) => e.id === edgeId)) {
      edges.push({
        id: edgeId,
        fromId: neighbor.id,
        toId: center.id,
        fkOwnerId: neighbor.id,
        fk: {
          name: fk.name,
          columns: fk.columns,
          refTable: fk.refTable,
          refColumns: fk.refColumns,
        },
        direction: "in",
      });
    }
  }

  const marked = nodes.map((n) =>
    n.id === centerId ? { ...n, expanded: true } : n,
  );
  return layoutRelationGraph({ rootId: graph.rootId, nodes: marked, edges });
}

export function setNodeIncluded(
  graph: RelationGraph,
  nodeId: string,
  included: boolean,
): RelationGraph {
  if (nodeId === graph.rootId) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === nodeId ? { ...n, included } : n,
    ),
  };
}

export function setNodeDetails(
  graph: RelationGraph,
  nodeId: string,
  details: TableDetails,
): RelationGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            details,
            h: HEAD + ROW * Math.min(8, Math.max(1, details.columns.length)) + 8,
          }
        : n,
    ),
  };
}

/**
 * Nodes that must be JOINed: every included node plus ancestors on a path
 * from root to an included node (via undirected edges).
 */
export function joinNodeIds(graph: RelationGraph): Set<string> {
  const included = new Set(
    graph.nodes.filter((n) => n.included).map((n) => n.id),
  );
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!adj.has(e.fromId)) adj.set(e.fromId, []);
    if (!adj.has(e.toId)) adj.set(e.toId, []);
    adj.get(e.fromId)!.push(e.toId);
    adj.get(e.toId)!.push(e.fromId);
  }

  const needed = new Set<string>([graph.rootId]);
  for (const target of included) {
    if (target === graph.rootId) continue;
    const prev = new Map<string, string | null>();
    const q = [graph.rootId];
    prev.set(graph.rootId, null);
    while (q.length) {
      const cur = q.shift()!;
      if (cur === target) break;
      for (const nxt of adj.get(cur) ?? []) {
        if (prev.has(nxt)) continue;
        prev.set(nxt, cur);
        q.push(nxt);
      }
    }
    if (!prev.has(target)) continue;
    let walk: string | null = target;
    while (walk) {
      needed.add(walk);
      walk = prev.get(walk) ?? null;
    }
  }
  return needed;
}

/** BFS order of join nodes from root along edges that connect needed set. */
export function joinOrder(graph: RelationGraph): string[] {
  const needed = joinNodeIds(graph);
  const order: string[] = [];
  const seen = new Set<string>();
  const q = [graph.rootId];
  seen.add(graph.rootId);
  while (q.length) {
    const cur = q.shift()!;
    if (needed.has(cur)) order.push(cur);
    for (const e of graph.edges) {
      const nxt =
        e.fromId === cur ? e.toId : e.toId === cur ? e.fromId : null;
      if (!nxt || seen.has(nxt) || !needed.has(nxt)) continue;
      seen.add(nxt);
      q.push(nxt);
    }
  }
  return order;
}

/** Pick one edge connecting parent (already joined) to child. */
export function edgeBetween(
  graph: RelationGraph,
  a: string,
  b: string,
): RelationEdge | undefined {
  return graph.edges.find(
    (e) =>
      (e.fromId === a && e.toId === b) || (e.fromId === b && e.toId === a),
  );
}

/** Simple layered layout: root left, others in columns by hop distance. */
export function layoutRelationGraph(graph: RelationGraph): RelationGraph {
  const dist = new Map<string, number>();
  dist.set(graph.rootId, 0);
  const q = [graph.rootId];
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur) ?? 0;
    for (const e of graph.edges) {
      const nxt =
        e.fromId === cur ? e.toId : e.toId === cur ? e.fromId : null;
      if (!nxt || dist.has(nxt)) continue;
      dist.set(nxt, d + 1);
      q.push(nxt);
    }
  }

  const layers = new Map<number, RelationNode[]>();
  for (const n of graph.nodes) {
    const d = dist.get(n.id) ?? 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(n);
  }

  const nodes = graph.nodes.map((n) => {
    const d = dist.get(n.id) ?? 0;
    const layer = layers.get(d) ?? [n];
    const idx = layer.findIndex((x) => x.id === n.id);
    return {
      ...n,
      x: GAP_X / 2 + d * (REL_BOX_W + GAP_X),
      y: GAP_Y / 2 + idx * (n.h + GAP_Y),
    };
  });

  return { ...graph, nodes };
}
