import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, FileCode2, ShieldCheck } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import type { SavedConnection } from "@/types";
import {
  EER_BOX_W,
  eerEdges,
  generateCreateSql,
  loadEerModel,
  validateModel,
  type EerModel,
  type EerTable,
} from "@/lib/eerModel";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  // same column: loop out the left side
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
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError("");
    loadEerModel(connection.id, connection.engine, schema)
      .then((r) => {
        if (dead) return;
        setModel(r.model);
        setSchemas(r.schemas);
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

  async function toQueryTab() {
    if (!model) return;
    const sql = generateCreateSql(model);
    if (actions?.openSqlInTab) {
      actions.openSqlInTab(sql);
      onClose();
    } else {
      await invoke("write_clipboard", { text: sql });
      setMsg("Query tab unavailable; SQL copied to clipboard.");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
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
            ? `${model.tables.length} tables · ${edges.length} relations${model.truncated ? " (truncated at 80)" : ""}`
            : loading
              ? "Reverse engineering…"
              : ""}
        </span>
        <div className="ml-auto flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={!model}
            onClick={() => setShowIssues((v) => !v)}
          >
            <ShieldCheck className="size-3.5" />
            Validate ({issues.length})
          </Button>
          <Button size="sm" variant="outline" disabled={!model} onClick={() => void exportSvg()}>
            <Download className="size-3.5" />
            Export SVG
          </Button>
          <Button size="sm" variant="outline" disabled={!model} onClick={() => void toQueryTab()}>
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
            <li className="text-muted-foreground">Model truncated at 80 tables; FK checks may be incomplete.</li>
          ) : null}
        </ul>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-muted/20">
        {model ? (
          <svg ref={svgRef} width={size.w} height={size.h} className="text-foreground">
            <defs>
              <marker id="eer-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
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
              return (
                <g key={t.ref} transform={`translate(${t.x},${t.y})`}>
                  <rect width={EER_BOX_W} height={t.h} rx="6" fill="var(--card)" stroke="currentColor" strokeOpacity="0.3" />
                  <rect width={EER_BOX_W} height="26" rx="6" fill={connection.accentColor || "#2563eb"} fillOpacity="0.9" />
                  <text x="10" y="17" fontSize="12" fontWeight="600" fill="#fff">
                    {t.ref.length > 30 ? `${t.ref.slice(0, 29)}…` : t.ref}
                  </text>
                  {t.details.columns.map((c, i) => (
                    <g key={c.name} transform={`translate(0,${26 + i * 17})`}>
                      <text x="10" y="13" fontSize="11" fontFamily="monospace" fill="currentColor" fontWeight={c.isPk ? 700 : 400}>
                        {c.isPk ? "🔑 " : fkCols.has(c.name) ? "↗ " : ""}
                        {c.name.length > 18 ? `${c.name.slice(0, 17)}…` : c.name}
                      </text>
                      <text x={EER_BOX_W - 8} y="13" fontSize="10" fontFamily="monospace" textAnchor="end" fill="currentColor" fillOpacity="0.55">
                        {c.dataType.length > 14 ? `${c.dataType.slice(0, 13)}…` : c.dataType}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>
    </div>
  );
}
