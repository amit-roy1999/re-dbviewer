import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Expand,
  Loader2,
  Plus,
  RefreshCw,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import type { FilterOp, ForeignKeyInfo, TableDetails } from "@/types";
import {
  describeTable,
  flattenTables,
  listSchema,
  shortName,
} from "@/lib/dbApi";
import { loadInboundFks } from "@/lib/relationInbound";
import {
  addNeighbors,
  createRootNode,
  emptyGraph,
  setNodeDetails,
  setNodeIncluded,
  type RelationEdge,
  type RelationGraph,
  type RelationNode,
} from "@/lib/relationGraph";
import {
  buildRelationSelect,
  type JoinType,
  type RelationFilter,
  type SelectedColumns,
} from "@/lib/relationQuerySql";
import { copyText } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const FILTER_OPS: { id: FilterOp; label: string }[] = [
  { id: "eq", label: "=" },
  { id: "ne", label: "≠" },
  { id: "gt", label: ">" },
  { id: "gte", label: "≥" },
  { id: "lt", label: "<" },
  { id: "lte", label: "≤" },
  { id: "like", label: "LIKE" },
  { id: "is_null", label: "IS NULL" },
  { id: "is_not_null", label: "IS NOT NULL" },
];

function newFilter(nodeId: string): RelationFilter {
  return {
    id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    nodeId,
    column: "",
    op: "eq",
    value: "",
    join: "and",
  };
}

type Props = {
  table: string;
  engine: string;
  connectionId: string;
  details: TableDetails;
  onOpenSql: (sql: string) => void;
};

function edgePath(a: RelationNode, b: RelationNode) {
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  if (b.x >= a.x + a.w - 4) {
    const dx = Math.max(24, (x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }
  // fallback: loop above
  return `M ${a.x + a.w / 2} ${a.y} C ${a.x + a.w / 2} ${a.y - 40}, ${b.x + b.w / 2} ${b.y - 40}, ${b.x + b.w / 2} ${b.y}`;
}

export function RelationQueryBuilder({
  table,
  engine,
  connectionId,
  details,
  onOpenSql,
}: Props) {
  const [graph, setGraph] = useState<RelationGraph>(() =>
    emptyGraph(createRootNode(table, details)),
  );
  const [selected, setSelected] = useState<SelectedColumns>({});
  const [filters, setFilters] = useState<RelationFilter[]>([]);
  const [joinType, setJoinType] = useState<JoinType>("LEFT");
  const [busy, setBusy] = useState(false);
  const [expanding, setExpanding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const seed = useCallback(async () => {
    setBusy(true);
    setError("");
    setMsg("");
    setFilters([]);
    try {
      const root = createRootNode(table, details);
      let g = emptyGraph(root);
      const schema = await listSchema(connectionId);
      const candidates = flattenTables(schema, engine).map((t) => t.ref);
      const inbound = await loadInboundFks(
        engine,
        table,
        connectionId,
        candidates,
      );
      const detailsByRef: Record<string, TableDetails> = { [table]: details };
      for (const fk of details.foreignKeys) {
        const ref = fk.refTable.includes(".")
          ? fk.refTable
          : table.includes(".")
            ? `${table.split(".").slice(0, -1).join(".")}.${fk.refTable}`
            : fk.refTable;
        try {
          detailsByRef[ref] = await describeTable(ref, connectionId);
        } catch {
          // keep null details
        }
      }
      for (const fk of inbound) {
        try {
          detailsByRef[fk.fromTable] = await describeTable(
            fk.fromTable,
            connectionId,
          );
        } catch {
          // skip
        }
      }
      g = addNeighbors(
        g,
        root.id,
        details.foreignKeys,
        inbound,
        detailsByRef,
      );
      setGraph(g);
      setSelected({
        [root.id]: details.columns.slice(0, 3).map((c) => c.name),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [table, engine, connectionId, details]);

  useEffect(() => {
    void seed();
  }, [seed]);

  const sql = useMemo(
    () =>
      buildRelationSelect({
        graph,
        engine,
        joinType,
        selected,
        filters,
      }),
    [graph, engine, joinType, selected, filters],
  );

  const includedNodes = useMemo(
    () => graph.nodes.filter((n) => n.included),
    [graph.nodes],
  );

  const size = useMemo(() => {
    const t = graph.nodes;
    return {
      w: Math.max(480, ...t.map((x) => x.x + x.w + 40)),
      h: Math.max(220, ...t.map((x) => x.y + x.h + 40)),
    };
  }, [graph.nodes]);

  async function expandNode(nodeId: string) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setExpanding(nodeId);
    setError("");
    try {
      let detailsLocal = node.details;
      if (!detailsLocal) {
        detailsLocal = await describeTable(node.ref, connectionId);
        setGraph((g) => setNodeDetails(g, nodeId, detailsLocal!));
      }
      const schema = await listSchema(connectionId);
      const candidates = flattenTables(schema, engine).map((t) => t.ref);
      const inbound = await loadInboundFks(
        engine,
        node.ref,
        connectionId,
        candidates,
      );
      const outbound: ForeignKeyInfo[] = detailsLocal.foreignKeys;
      const detailsByRef: Record<string, TableDetails> = {
        [node.ref]: detailsLocal,
      };
      for (const fk of outbound) {
        const ref = fk.refTable.includes(".")
          ? fk.refTable
          : node.ref.includes(".")
            ? `${node.ref.split(".").slice(0, -1).join(".")}.${fk.refTable}`
            : fk.refTable;
        try {
          detailsByRef[ref] = await describeTable(ref, connectionId);
        } catch {
          /* */
        }
      }
      for (const fk of inbound) {
        try {
          detailsByRef[fk.fromTable] = await describeTable(
            fk.fromTable,
            connectionId,
          );
        } catch {
          /* */
        }
      }
      setGraph((g) => {
        const withDetails = node.details
          ? g
          : setNodeDetails(g, nodeId, detailsLocal!);
        return addNeighbors(
          withDetails,
          nodeId,
          outbound,
          inbound,
          detailsByRef,
        );
      });
      setMsg(`Expanded ${shortName(node.ref)}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setExpanding(null);
    }
  }

  function toggleInclude(node: RelationNode) {
    if (node.isRoot) return;
    const next = !node.included;
    setGraph((g) => setNodeIncluded(g, node.id, next));
    if (!next) {
      setFilters((prev) => prev.filter((f) => f.nodeId !== node.id));
    }
  }

  function patchFilter(id: string, patch: Partial<RelationFilter>) {
    setFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
  }

  function toggleColumn(nodeId: string, col: string) {
    setSelected((prev) => {
      const cur = new Set(prev[nodeId] ?? []);
      if (cur.has(col)) cur.delete(col);
      else cur.add(col);
      return { ...prev, [nodeId]: [...cur] };
    });
  }

  async function copySql() {
    try {
      await copyText(sql);
      setMsg("SQL copied");
    } catch (e) {
      setError(String(e));
    }
  }

  const edgesByPair = graph.edges;

  return (
    <div
      data-testid="relation-query-builder"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">Join</span>
        <div className="flex rounded-md border border-border">
          {(["LEFT", "INNER"] as const).map((j) => (
            <button
              key={j}
              type="button"
              className={cn(
                "h-7 px-2 font-mono text-[11px]",
                joinType === j
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setJoinType(j)}
            >
              {j}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={busy}
          onClick={() => void seed()}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Reset
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={!sql}
          onClick={() => void copySql()}
        >
          <Copy className="size-3.5" />
          Copy
        </Button>
        <Button
          size="sm"
          className="h-7"
          disabled={!sql}
          onClick={() => onOpenSql(sql)}
        >
          <SquareArrowOutUpRight className="size-3.5" />
          Open in query tab
        </Button>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Click a related table to include · Expand for nested joins
        </span>
      </div>

      {error ? (
        <Alert variant="destructive" className="m-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}
      {msg && !error ? (
        <p className="px-3 py-1 text-[10px] text-muted-foreground">{msg}</p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(160px,1fr)_auto] lg:grid-cols-[1fr_280px] lg:grid-rows-1">
        <div className="min-h-0 overflow-auto border-b border-border lg:border-r lg:border-b-0">
          {busy && graph.nodes.length <= 1 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading relations…
            </div>
          ) : graph.nodes.length === 1 && !details.foreignKeys.length ? (
            <div className="p-4 text-sm text-muted-foreground">
              No foreign keys on this table yet. Inbound relations (if any) appear
              after load. Expand after other tables reference this one.
            </div>
          ) : (
            <svg
              width={size.w}
              height={size.h}
              className="block"
              data-testid="relation-graph"
            >
              {edgesByPair.map((e: RelationEdge) => {
                const from = graph.nodes.find((n) => n.id === e.fromId);
                const to = graph.nodes.find((n) => n.id === e.toId);
                if (!from || !to) return null;
                const left = from.x <= to.x ? from : to;
                const right = from.x <= to.x ? to : from;
                return (
                  <g key={e.id}>
                    <path
                      d={edgePath(left, right)}
                      fill="none"
                      className="stroke-border"
                      strokeWidth={1.5}
                    />
                    <title>
                      {e.fk.columns.join(",")} → {e.fk.refColumns.join(",")} (
                      {e.direction})
                    </title>
                  </g>
                );
              })}
              {graph.nodes.map((n) => (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  className="cursor-pointer"
                  onClick={() => toggleInclude(n)}
                >
                  <rect
                    width={n.w}
                    height={n.h}
                    rx={6}
                    className={cn(
                      "stroke-border",
                      n.included
                        ? "fill-primary/10 stroke-primary"
                        : "fill-card",
                      n.isRoot && "stroke-primary stroke-2",
                    )}
                  />
                  <text
                    x={8}
                    y={18}
                    className="fill-foreground font-mono text-[11px] font-semibold"
                  >
                    {n.name}
                    {n.isRoot ? " (root)" : ""}
                  </text>
                  {(n.details?.columns ?? []).slice(0, 6).map((c, i) => (
                    <text
                      key={c.name}
                      x={8}
                      y={36 + i * 14}
                      className="fill-muted-foreground font-mono text-[10px]"
                    >
                      {c.isPk ? "🔑 " : ""}
                      {c.name}
                    </text>
                  ))}
                  {!n.isRoot ? (
                    <foreignObject x={n.w - 56} y={4} width={52} height={22}>
                      <button
                        type="button"
                        className="flex h-5 items-center gap-0.5 rounded px-1 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Expand relations"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void expandNode(n.id);
                        }}
                      >
                        {expanding === n.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Expand className="size-3" />
                        )}
                        Expand
                      </button>
                    </foreignObject>
                  ) : null}
                  {n.included && !n.isRoot ? (
                    <circle
                      cx={n.w - 10}
                      cy={n.h - 10}
                      r={6}
                      className="fill-primary"
                    />
                  ) : null}
                </g>
              ))}
            </svg>
          )}
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border px-3 py-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Columns
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {includedNodes.map((n) => (
              <div key={n.id} className="mb-3">
                <div className="mb-1 flex items-center gap-1.5">
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {n.name}
                  </Badge>
                  {n.isRoot ? (
                    <span className="text-[10px] text-muted-foreground">
                      root
                    </span>
                  ) : null}
                </div>
                <ul className="flex flex-col gap-0.5">
                  {(n.details?.columns ?? []).map((c) => {
                    const on = (selected[n.id] ?? []).includes(c.name);
                    return (
                      <li key={c.name}>
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left font-mono text-[11px] hover:bg-muted/80",
                            on && "bg-muted",
                          )}
                          onClick={() => toggleColumn(n.id, c.name)}
                        >
                          {on ? (
                            <Check className="size-3 text-primary" />
                          ) : (
                            <span className="size-3" />
                          )}
                          {c.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        data-testid="relation-filters"
        className="shrink-0 border-t border-border"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-1">
          <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Filters
          </span>
          <Button
            size="xs"
            variant="outline"
            className="ml-auto"
            disabled={!includedNodes.length}
            onClick={() =>
              setFilters((prev) => [
                ...prev,
                newFilter(includedNodes[0]?.id ?? graph.rootId),
              ])
            }
          >
            <Plus className="size-3" />
            Add filter
          </Button>
        </div>
        <div className="max-h-36 space-y-1.5 overflow-auto px-2 py-2">
          {!filters.length ? (
            <p className="px-1 text-[11px] text-muted-foreground">
              Optional WHERE conditions on included tables.
            </p>
          ) : (
            filters.map((f, i) => {
              const node =
                includedNodes.find((n) => n.id === f.nodeId) ??
                includedNodes[0];
              const cols = node?.details?.columns ?? [];
              const needsValue =
                f.op !== "is_null" && f.op !== "is_not_null";
              return (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {i > 0 ? (
                    <select
                      className="h-7 rounded-md border border-border bg-background px-1.5 font-mono text-[10px]"
                      value={f.join ?? "and"}
                      onChange={(e) =>
                        patchFilter(f.id, {
                          join: e.target.value as "and" | "or",
                        })
                      }
                    >
                      <option value="and">AND</option>
                      <option value="or">OR</option>
                    </select>
                  ) : (
                    <span className="w-10 text-center text-[10px] text-muted-foreground">
                      WHERE
                    </span>
                  )}
                  <select
                    className="h-7 max-w-[7rem] rounded-md border border-border bg-background px-1.5 font-mono text-[10px]"
                    value={f.nodeId}
                    onChange={(e) => {
                      const nodeId = e.target.value;
                      patchFilter(f.id, { nodeId, column: "" });
                    }}
                  >
                    {includedNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-7 max-w-[8rem] rounded-md border border-border bg-background px-1.5 font-mono text-[10px]"
                    value={f.column}
                    onChange={(e) =>
                      patchFilter(f.id, { column: e.target.value })
                    }
                  >
                    <option value="">column…</option>
                    {cols.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-7 rounded-md border border-border bg-background px-1.5 font-mono text-[10px]"
                    value={f.op}
                    onChange={(e) =>
                      patchFilter(f.id, { op: e.target.value as FilterOp })
                    }
                  >
                    {FILTER_OPS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {needsValue ? (
                    <Input
                      className="h-7 max-w-[9rem] font-mono text-[11px]"
                      value={f.value ?? ""}
                      placeholder="value"
                      onChange={(e) =>
                        patchFilter(f.id, { value: e.target.value })
                      }
                    />
                  ) : null}
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    title="Remove filter"
                    onClick={() =>
                      setFilters((prev) => prev.filter((x) => x.id !== f.id))
                    }
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border">
        <div className="border-b border-border px-3 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          SQL preview
        </div>
        <pre
          data-testid="relation-sql-preview"
          className="max-h-40 overflow-auto bg-card/50 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
        >
          {sql || "—"}
        </pre>
      </div>
    </div>
  );
}
