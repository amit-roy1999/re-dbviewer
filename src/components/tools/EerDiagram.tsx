import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, FileCode2, Link2, ShieldCheck, Trash2 } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import type { ForeignKeyInfo, SavedConnection } from "@/types";
import {
  EER_BOX_W,
  cloneEerModel,
  eerEdges,
  generateCreateSql,
  loadEerModel,
  pendingFkDdl,
  validateModel,
  type EerModel,
  type EerTable,
} from "@/lib/eerModel";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { useWorkspaceActions } from "@/lib/workspaceActions";
import { invoke } from "@tauri-apps/api/core";

function edgePath(a: EerTable, b: EerTable, rowY: number) {
  const y1 = a.y + rowY;
  const y2 = b.y + 13;
  if (a === b) {
    const x = a.x + a.w;
    return `M ${x} ${y1} C ${x + 40} ${y1}, ${x + 40} ${y1 + 30}, ${x} ${y1 + 30}`;
  }
  const rightOfA = b.x >= a.x + a.w;
  const leftOfA = b.x + b.w <= a.x;
  if (rightOfA || leftOfA) {
    const x1 = rightOfA ? a.x + a.w : a.x;
    const x2 = rightOfA ? b.x : b.x + b.w;
    const dx = Math.max(30, Math.abs(x2 - x1) / 2) * (rightOfA ? 1 : -1);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }
  const x1 = a.x;
  const x2 = b.x;
  return `M ${x1} ${y1} C ${x1 - 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}`;
}

export function EerDiagram({
  connection,
  onClose,
}: {
  connection: SavedConnection;
  onClose: () => void;
}) {
  const actions = useWorkspaceActions();
  const [schemas, setSchemas] = useState<string[]>([]);
  const [schema, setSchema] = useState<string | null>(null);
  const [model, setModel] = useState<EerModel | null>(null);
  const [baseline, setBaseline] = useState<EerModel | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [showDdl, setShowDdl] = useState(false);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [addTo, setAddTo] = useState("");
  const [addCol, setAddCol] = useState("");
  const [addRefCol, setAddRefCol] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    ref: string;
    ox: number;
    oy: number;
    mx: number;
    my: number;
  } | null>(null);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError("");
    loadEerModel(connection.id, connection.engine, schema)
      .then((r) => {
        if (dead) return;
        setModel(r.model);
        setBaseline(cloneEerModel(r.model));
        setSchemas(r.schemas);
        setSelectedRef(r.model.tables[0]?.ref ?? null);
      })
      .catch((e) => !dead && setError(String(e)))
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
    };
  }, [connection.id, connection.engine, schema]);

  const issues = useMemo(() => (model ? validateModel(model) : []), [model]);
  const edges = useMemo(() => (model ? eerEdges(model) : []), [model]);
  const size = useMemo(() => {
    const t = model?.tables ?? [];
    return {
      w: Math.max(400, ...t.map((x) => x.x + x.w + 80)),
      h: Math.max(300, ...t.map((x) => x.y + x.h + 40)),
    };
  }, [model]);
  const ddl = useMemo(
    () => (baseline && model ? pendingFkDdl(baseline, model) : ""),
    [baseline, model],
  );
  const selected = model?.tables.find((t) => t.ref === selectedRef) ?? null;
  const targetTable = model?.tables.find((t) => t.ref === addTo) ?? null;

  useEffect(() => {
    if (!selected) return;
    const col = selected.details.columns.find((c) => !c.isPk)?.name
      ?? selected.details.columns[0]?.name
      ?? "";
    setAddCol(col);
  }, [selectedRef]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!targetTable) return;
    const pk = targetTable.details.columns.find((c) => c.isPk)?.name
      ?? targetTable.details.columns[0]?.name
      ?? "";
    setAddRefCol(pk);
  }, [addTo]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateTable(ref: string, fn: (t: EerTable) => EerTable) {
    setModel((m) => {
      if (!m) return m;
      return {
        ...m,
        tables: m.tables.map((t) => (t.ref === ref ? fn(t) : t)),
      };
    });
  }

  function removeFk(tableRef: string, fk: ForeignKeyInfo) {
    updateTable(tableRef, (t) => ({
      ...t,
      details: {
        ...t.details,
        foreignKeys: t.details.foreignKeys.filter(
          (f) =>
            !(
              f.name === fk.name &&
              f.columns.join() === fk.columns.join() &&
              f.refTable === fk.refTable
            ),
        ),
      },
    }));
  }

  function addFk() {
    if (!selected || !addTo || !addCol || !addRefCol) {
      setError("Pick source column, target table, and target column");
      return;
    }
    const fk: ForeignKeyInfo = {
      name: `fk_${selected.name}_${addCol}`,
      columns: [addCol],
      refTable: addTo,
      refColumns: [addRefCol],
    };
    updateTable(selected.ref, (t) => ({
      ...t,
      details: {
        ...t.details,
        foreignKeys: [...t.details.foreignKeys, fk],
      },
    }));
    setMsg(`Added FK ${fk.name}`);
    setError("");
  }

  function onPointerDown(e: React.PointerEvent, t: EerTable) {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = {
      ref: t.ref,
      ox: t.x,
      oy: t.y,
      mx: e.clientX,
      my: e.clientY,
    };
    setSelectedRef(t.ref);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !model) return;
    const dx = e.clientX - d.mx;
    const dy = e.clientY - d.my;
    updateTable(d.ref, (t) => ({
      ...t,
      x: Math.max(0, d.ox + dx),
      y: Math.max(0, d.oy + dy),
    }));
  }

  function onPointerUp() {
    drag.current = null;
  }

  async function exportSvg() {
    const el = svgRef.current;
    if (!el) return;
    const clone = el.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("style", "color:#111;background:#fff");
    const xml = new XMLSerializer()
      .serializeToString(clone)
      .split("var(--card)")
      .join("#f8fafc");
    try {
      const path = await save({
        defaultPath: "diagram.svg",
        filters: [{ name: "SVG", extensions: ["svg"] }],
      });
      if (!path) return;
      await invoke("write_text_file", { path, contents: xml });
      setMsg(`Diagram saved → ${path}`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function toQueryTab(sql: string) {
    if (actions?.openSqlInTab) {
      actions.openSqlInTab(sql);
      onClose();
    } else {
      await invoke("write_clipboard", { text: sql });
      setMsg("Query tab unavailable; SQL copied to clipboard.");
    }
  }

  return (
    <div data-testid="eer-diagram" className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {schemas.length > 1 ? (
          <select
            className="h-7 rounded-lg border border-input bg-transparent px-2 text-xs dark:bg-input/30 dark:[color-scheme:dark]"
            value={schema ?? ""}
            onChange={(e) => setSchema(e.target.value || null)}
          >
            <option value="">All schemas</option>
            {schemas.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {model
            ? `${model.tables.length} tables · ${edges.length} relations · drag boxes to rearrange${model.truncated ? " (truncated at 80)" : ""}`
            : loading
              ? "Reverse engineering…"
              : ""}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={!model}
            onClick={() => setShowIssues((v) => !v)}
          >
            <ShieldCheck className="size-3.5" />
            Validate ({issues.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!ddl}
            data-testid="eer-pending-ddl"
            onClick={() => setShowDdl((v) => !v)}
          >
            <Link2 className="size-3.5" />
            Pending DDL{ddl ? "" : " (none)"}
          </Button>
          <Button size="sm" variant="outline" disabled={!model} onClick={() => void exportSvg()}>
            <Download className="size-3.5" />
            Export SVG
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!model}
            onClick={() => model && void toQueryTab(generateCreateSql(model))}
          >
            <FileCode2 className="size-3.5" />
            Forward engineer → query tab
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!model}
            onClick={async () => {
              if (!model) return;
              await invoke("write_clipboard", { text: generateCreateSql(model) });
              setMsg("CREATE script copied.");
            }}
          >
            <Copy className="size-3.5" />
            Copy SQL
          </Button>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {msg ? (
        <Alert>
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      ) : null}
      {showIssues ? (
        <ul className="max-h-32 overflow-auto rounded-md border border-border p-2 font-mono text-xs">
          {issues.length === 0 ? (
            <li className="text-muted-foreground">No issues found.</li>
          ) : (
            issues.map((i) => <li key={i}>{i}</li>)
          )}
          {model?.truncated ? (
            <li className="text-muted-foreground">
              Model truncated at 80 tables; FK checks may be incomplete.
            </li>
          ) : null}
        </ul>
      ) : null}
      {showDdl && ddl ? (
        <div
          data-testid="eer-ddl-preview"
          className="flex max-h-40 flex-col gap-1 rounded-md border border-border p-2"
        >
          <pre className="min-h-0 flex-1 overflow-auto font-mono text-xs whitespace-pre-wrap">
            {ddl}
          </pre>
          <Button
            size="sm"
            className="self-start"
            onClick={() => void toQueryTab(ddl)}
          >
            Open pending DDL in query tab
          </Button>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border border-border bg-muted/20">
          {model ? (
            <svg
              ref={svgRef}
              width={size.w}
              height={size.h}
              className="text-foreground"
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              <defs>
                <marker
                  id="eer-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" opacity="0.6" />
                </marker>
              </defs>
              {edges.map((e, i) => {
                const idx = Math.max(
                  0,
                  e.from.details.columns.findIndex((c) => c.name === e.fk.columns[0]),
                );
                return (
                  <path
                    key={i}
                    d={edgePath(e.from, e.to, 26 + idx * 17 + 9)}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.45"
                    strokeWidth="1.2"
                    markerEnd="url(#eer-arrow)"
                  >
                    <title>
                      {`${e.from.name}.${e.fk.columns.join(",")} → ${e.to.name}.${e.fk.refColumns.join(",")}`}
                    </title>
                  </path>
                );
              })}
              {model.tables.map((t) => {
                const fkCols = new Set(t.details.foreignKeys.flatMap((f) => f.columns));
                const sel = t.ref === selectedRef;
                return (
                  <g
                    key={t.ref}
                    data-testid={`eer-table-${t.name}`}
                    transform={`translate(${t.x},${t.y})`}
                    onPointerDown={(e) => onPointerDown(e, t)}
                    style={{ cursor: "grab" }}
                  >
                    <rect
                      width={EER_BOX_W}
                      height={t.h}
                      rx="6"
                      fill="var(--card)"
                      stroke={sel ? "var(--primary)" : "currentColor"}
                      strokeOpacity={sel ? 1 : 0.3}
                      strokeWidth={sel ? 2 : 1}
                    />
                    <rect
                      width={EER_BOX_W}
                      height="26"
                      rx="6"
                      fill={connection.accentColor || "#2563eb"}
                      fillOpacity="0.9"
                    />
                    <text x="10" y="17" fontSize="12" fontWeight="600" fill="#fff">
                      {t.ref.length > 30 ? `${t.ref.slice(0, 29)}…` : t.ref}
                    </text>
                    {t.details.columns.map((c, i) => (
                      <g key={c.name} transform={`translate(0,${26 + i * 17})`}>
                        <text
                          x="10"
                          y="13"
                          fontSize="11"
                          fontFamily="monospace"
                          fill="currentColor"
                          fontWeight={c.isPk ? 700 : 400}
                        >
                          {c.isPk ? "🔑 " : fkCols.has(c.name) ? "↗ " : ""}
                          {c.name.length > 18 ? `${c.name.slice(0, 17)}…` : c.name}
                        </text>
                        <text
                          x={EER_BOX_W - 8}
                          y="13"
                          fontSize="10"
                          fontFamily="monospace"
                          textAnchor="end"
                          fill="currentColor"
                          fillOpacity="0.55"
                        >
                          {c.dataType.length > 14
                            ? `${c.dataType.slice(0, 13)}…`
                            : c.dataType}
                        </text>
                      </g>
                    ))}
                  </g>
                );
              })}
            </svg>
          ) : null}
        </div>
        {selected ? (
          <aside
            data-testid="eer-edit-panel"
            className="flex w-64 shrink-0 flex-col gap-2 overflow-auto rounded-md border border-border p-2 text-xs"
          >
            <p className="font-medium">{selected.ref}</p>
            <div>
              <Label className="text-xs">Foreign keys</Label>
              <ul className="mt-1 space-y-1">
                {selected.details.foreignKeys.length === 0 ? (
                  <li className="text-muted-foreground">None</li>
                ) : (
                  selected.details.foreignKeys.map((fk, i) => (
                    <li
                      key={i}
                      className="flex items-start justify-between gap-1 rounded border border-border px-1.5 py-1 font-mono"
                    >
                      <span>
                        {fk.columns.join(",")} → {fk.refTable}.{fk.refColumns.join(",")}
                      </span>
                      <button
                        type="button"
                        data-testid="eer-remove-fk"
                        className="text-destructive"
                        title="Remove FK"
                        onClick={() => removeFk(selected.ref, fk)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="grid gap-1 border-t border-border pt-2">
              <Label className="text-xs">Add FK</Label>
              <select
                data-testid="eer-add-col"
                className="h-7 rounded border border-input bg-transparent px-1"
                value={addCol}
                onChange={(e) => setAddCol(e.target.value)}
              >
                {selected.details.columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                data-testid="eer-add-to"
                className="h-7 rounded border border-input bg-transparent px-1"
                value={addTo}
                onChange={(e) => setAddTo(e.target.value)}
              >
                <option value="">Target table…</option>
                {model?.tables
                  .filter((t) => t.ref !== selected.ref)
                  .map((t) => (
                    <option key={t.ref} value={t.ref}>
                      {t.ref}
                    </option>
                  ))}
              </select>
              <select
                data-testid="eer-add-ref-col"
                className="h-7 rounded border border-input bg-transparent px-1"
                value={addRefCol}
                onChange={(e) => setAddRefCol(e.target.value)}
                disabled={!targetTable}
              >
                {(targetTable?.details.columns ?? []).map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button size="sm" data-testid="eer-add-fk" onClick={addFk}>
                Add foreign key
              </Button>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
