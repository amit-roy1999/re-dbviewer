import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import embed from "vega-embed";
import {
  Loader2,
  FolderOpen,
  Save,
  Play,
  Download,
  PanelTop,
} from "lucide-react";
import type { QueryResult, SavedConnection, TableDetails } from "@/types";
import { useWorkspaceActions } from "@/lib/workspaceActions";
import {
  describeTable,
  flattenTables,
  listSchema,
  tableRef,
  type TableEntry,
} from "@/lib/dbApi";
import { buildRelationSelect } from "@/lib/relationQuerySql";
import {
  parseVisualizeFile,
  serializeVisualizeFile,
  sqlWithLimit,
  VISUALIZE_FORMAT,
  VISUALIZE_VERSION,
  type VisualizeFileV1,
} from "@/lib/visualizeFile";
import {
  buildVegaLiteSpec,
  CHART_HELP,
  CHART_MARKS,
  defaultEncoding,
  rowsFromResult,
  vegaThemeConfig,
  type ChartConfig,
  type ChartMark,
} from "@/lib/visualizeSpec";
import {
  RelationQueryBuilder,
  type RelationQueryModel,
} from "@/components/RelationQueryBuilder";
import { ChartMappingAnatomy } from "@/components/tools/ChartMappingAnatomy";
import { SearchableColumnSelect } from "@/components/tools/SearchableColumnSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type Step = "data" | "chart" | "preview";

type Props = {
  connection: SavedConnection;
  /** True when rendered inside a workspace tab (hide “Open as tab”). */
  embedded?: boolean;
  /** Called after requesting a workspace tab so the tools dialog can close. */
  onMovedToTab?: () => void;
};

export function VisualizeData({
  connection,
  embedded = false,
  onMovedToTab,
}: Props) {
  const actions = useWorkspaceActions();
  const engine = connection.engine;
  const connectionId = connection.id;
  const [step, setStep] = useState<Step>("data");
  const [schemaNames, setSchemaNames] = useState<string[]>([]);
  const [allTables, setAllTables] = useState<TableEntry[]>([]);
  const [selectedSchema, setSelectedSchema] = useState("");
  const [root, setRoot] = useState("");
  const [details, setDetails] = useState<TableDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [limit, setLimit] = useState(2000);
  const [model, setModel] = useState<RelationQueryModel | null>(null);
  const [initialModel, setInitialModel] = useState<Omit<
    RelationQueryModel,
    "sql"
  > | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [chart, setChart] = useState<ChartConfig>({
    mark: "bar",
    encoding: { x: null, y: null, color: null, size: null },
  });
  const chartHost = useRef<HTMLDivElement>(null);

  const values = useMemo(
    () =>
      result
        ? rowsFromResult(result.columns, result.rows)
        : ([] as Record<string, unknown>[]),
    [result],
  );

  const vlSpec = useMemo(
    () => (result ? buildVegaLiteSpec(chart, values) : null),
    [chart, values, result],
  );

  const tablesInSchema = useMemo(
    () => allTables.filter((t) => t.schema === selectedSchema),
    [allTables, selectedSchema],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nodes = await listSchema(connectionId);
        if (cancelled) return;
        const names = nodes.map((n) => n.name);
        setSchemaNames(names);

        const flat = flattenTables(nodes, engine);
        const withViews = [...flat];
        for (const s of nodes) {
          for (const c of s.children) {
            if (c.kind !== "view") continue;
            const ref = tableRef(s.name, c.name, engine);
            if (!withViews.some((t) => t.ref === ref)) {
              withViews.push({
                schema: s.name,
                name: c.name,
                ref,
                kind: "view",
              });
            }
          }
        }
        setAllTables(withViews);

        const db = connection.config.database?.trim() ?? "";
        const prefer =
          (db && names.includes(db) ? db : null) ??
          (names.length === 1 ? names[0] : names[0] ?? "");
        setSelectedSchema((prev) =>
          prev && names.includes(prev) ? prev : prefer,
        );
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectionId, engine, connection.config.database]);

  // When schema changes, keep root if still valid; else pick first table.
  useEffect(() => {
    if (!selectedSchema) return;
    const inSchema = allTables.filter((t) => t.schema === selectedSchema);
    if (!inSchema.length) {
      setRoot("");
      return;
    }
    setRoot((prev) =>
      inSchema.some((t) => t.ref === prev) ? prev : inSchema[0].ref,
    );
  }, [selectedSchema, allTables]);

  useEffect(() => {
    if (!root) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError("");
      try {
        const d = await describeTable(root, connectionId);
        if (!cancelled) {
          setDetails(d);
          setInitialModel(null);
        }
      } catch (e) {
        if (!cancelled) {
          setDetails(null);
          setError(String(e));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, connectionId]);

  useEffect(() => {
    const el = chartHost.current;
    if (!el || step !== "preview" || !vlSpec) {
      if (el) el.innerHTML = "";
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastW = 0;
    let lastH = 0;
    let lastDark =
      document.documentElement.classList.contains("dark");
    let view: { finalize?: () => void } | null = null;

    const render = (force = false) => {
      const w = Math.max(280, Math.floor(el.clientWidth - 8));
      const h = Math.max(240, Math.floor(el.clientHeight - 8));
      const dark = document.documentElement.classList.contains("dark");
      if (!force && view && w === lastW && h === lastH && dark === lastDark) {
        return;
      }
      lastW = w;
      lastH = h;
      lastDark = dark;
      const spec = {
        ...vlSpec,
        width: w,
        height: h,
        autosize: { type: "fit", contains: "padding" },
        config: vegaThemeConfig(),
      };
      void embed(el, spec as never, {
        actions: false,
        renderer: "canvas",
      }).then((res) => {
        if (cancelled) {
          res.view.finalize();
          return;
        }
        view?.finalize?.();
        view = res.view;
      });
    };

    render(true);
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => render(), 80);
    });
    ro.observe(el);
    const themeObs = new MutationObserver(() => render(true));
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      ro.disconnect();
      themeObs.disconnect();
      view?.finalize?.();
      el.innerHTML = "";
    };
  }, [vlSpec, step, values]);

  const onModelChange = useCallback((m: RelationQueryModel) => {
    setModel(m);
  }, []);

  async function runQuery(sqlOverride?: string) {
    const base =
      sqlOverride ??
      model?.sql ??
      (model
        ? buildRelationSelect({
            graph: model.graph,
            engine,
            joinType: model.joinType,
            selected: model.selected,
            filters: model.filters,
          })
        : "");
    if (!base.trim()) {
      setError("Build a query first (include tables / columns).");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const sql = sqlWithLimit(base, engine, limit);
      const res = await invoke<QueryResult>("run_sql", {
        sql,
        connectionId,
      });
      setResult(res);
      setChart((prev) => ({
        ...prev,
        encoding:
          prev.encoding.x || prev.encoding.y
            ? prev.encoding
            : defaultEncoding(res.columns),
      }));
      setStep("chart");
      setMsg(`${res.rows.length} row(s) loaded`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveRecipe() {
    if (!model || !root) {
      setError("Nothing to save — run a query first.");
      return;
    }
    const path = await save({
      defaultPath: "chart.rdbviz.json",
      filters: [{ name: "re-dbviewer visualize", extensions: ["rdbviz.json", "json"] }],
    });
    if (!path) return;
    const doc: VisualizeFileV1 = {
      format: VISUALIZE_FORMAT,
      version: VISUALIZE_VERSION,
      connectionHint: { name: connection.name, engine },
      query: {
        root,
        joinType: model.joinType,
        selected: model.selected,
        filters: model.filters,
        graph: model.graph,
        limit,
      },
      chart,
    };
    try {
      await invoke("write_text_file", {
        path,
        contents: serializeVisualizeFile(doc),
      });
      setMsg(`Saved ${path}`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function exportVegaLite() {
    if (!vlSpec) {
      setError("Generate a chart preview first (not Table mark).");
      return;
    }
    const path = await save({
      defaultPath: "chart.vl.json",
      filters: [{ name: "Vega-Lite", extensions: ["vl.json", "json"] }],
    });
    if (!path) return;
    try {
      await invoke("write_text_file", {
        path,
        contents: `${JSON.stringify(vlSpec, null, 2)}\n`,
      });
      setMsg(`Exported Vega-Lite → ${path}`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function openRecipe() {
    const path = await open({
      multiple: false,
      filters: [{ name: "re-dbviewer visualize", extensions: ["rdbviz.json", "json"] }],
    });
    if (typeof path !== "string") return;
    setBusy(true);
    setError("");
    try {
      const text = await invoke<string>("read_text_file", { path });
      const doc = parseVisualizeFile(text);
      if (
        doc.connectionHint.engine !== engine ||
        doc.connectionHint.name !== connection.name
      ) {
        setMsg(
          `File was saved for “${doc.connectionHint.name}” (${doc.connectionHint.engine}); using current connection “${connection.name}”.`,
        );
      }
      setRoot(doc.query.root);
      {
        const parts = doc.query.root.split(".");
        const schemaFromRoot =
          parts.length >= 2
            ? parts.slice(0, -1).join(".")
            : schemaNames.find((n) => n === "main" || n === "dbo") ??
              schemaNames[0] ??
              "";
        if (schemaFromRoot) setSelectedSchema(schemaFromRoot);
      }
      setLimit(doc.query.limit);
      setChart(doc.chart);
      setInitialModel({
        graph: doc.query.graph,
        selected: doc.query.selected,
        filters: doc.query.filters,
        joinType: doc.query.joinType,
      });
      const sql = buildRelationSelect({
        graph: doc.query.graph,
        engine,
        joinType: doc.query.joinType,
        selected: doc.query.selected,
        filters: doc.query.filters,
      });
      const res = await invoke<QueryResult>("run_sql", {
        sql: sqlWithLimit(sql, engine, doc.query.limit),
        connectionId,
      });
      setResult(res);
      setModel({
        sql,
        graph: doc.query.graph,
        selected: doc.query.selected,
        filters: doc.query.filters,
        joinType: doc.query.joinType,
      });
      setStep("preview");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function setMark(mark: ChartMark) {
    setChart((c) => {
      if (mark === "table") return { ...c, mark };
      const cols = result?.columns ?? [];
      const keep =
        c.encoding.x || c.encoding.y
          ? c.encoding
          : defaultEncoding(cols);
      return { mark, encoding: keep };
    });
  }

  function setEnc(key: keyof ChartConfig["encoding"], value: string) {
    setChart((c) => ({
      ...c,
      encoding: { ...c.encoding, [key]: value || null },
    }));
  }

  return (
    <div
      data-testid="visualize-data"
      className="flex h-full min-h-0 flex-col gap-2"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border pb-2">
        <div className="flex rounded-md border border-border p-0.5">
          {(
            [
              ["data", "1. Data"],
              ["chart", "2. Chart"],
              ["preview", "3. Preview"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "h-7 rounded-sm px-2 text-xs",
                step === id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setStep(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Limit
          <Input
            type="number"
            className="h-7 w-20"
            min={1}
            max={50000}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 2000)}
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={busy}
          onClick={() => void openRecipe()}
        >
          <FolderOpen className="size-3.5" />
          Open…
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={busy || !model}
          onClick={() => void saveRecipe()}
        >
          <Save className="size-3.5" />
          Save…
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={busy || !vlSpec}
          onClick={() => void exportVegaLite()}
        >
          <Download className="size-3.5" />
          Export Vega-Lite…
        </Button>
        {!embedded ? (
          <Button
            size="sm"
            variant="secondary"
            className="h-7"
            data-testid="visualize-open-as-tab"
            onClick={() => {
              actions?.openVisualizeTab?.();
              onMovedToTab?.();
            }}
          >
            <PanelTop className="size-3.5" />
            Open as tab
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}
      {msg && !error ? (
        <p className="text-[10px] text-muted-foreground">{msg}</p>
      ) : null}

      {step === "data" ? (
        <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
            <label className="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial">
              <span className="shrink-0 text-muted-foreground">Schema</span>
              <select
                className="h-8 min-w-[8rem] flex-1 rounded-md border border-input bg-transparent px-2 text-xs"
                value={selectedSchema}
                onChange={(e) => setSelectedSchema(e.target.value)}
                data-testid="visualize-schema"
              >
                {schemaNames.length === 0 ? (
                  <option value="">—</option>
                ) : null}
                {schemaNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-muted-foreground">Table</span>
              <select
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-xs"
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                disabled={!selectedSchema || tablesInSchema.length === 0}
                data-testid="visualize-table"
              >
                {tablesInSchema.length === 0 ? (
                  <option value="">No tables</option>
                ) : null}
                {tablesInSchema.map((t) => (
                  <option key={t.ref} value={t.ref}>
                    {t.name}
                    {t.kind === "view" ? " (view)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              className="h-8"
              disabled={busy || !model?.sql}
              onClick={() => void runQuery()}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Run query
            </Button>
          </div>
          {details && root ? (
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
              <RelationQueryBuilder
                key={`${root}-${initialModel ? "load" : "new"}`}
                table={root}
                engine={engine}
                connectionId={connectionId}
                details={details}
                onModelChange={onModelChange}
                primaryActionLabel="Run query"
                onPrimaryAction={(sql) => void runQuery(sql)}
                initialModel={initialModel}
                autoIncludeNeighbors
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {busy ? "Loading table…" : "Select a root table to build joins."}
            </p>
          )}
        </div>
      ) : null}

      {step === "chart" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-1">
          {!result ? (
            <p className="text-sm text-muted-foreground">
              Run a query on the Data step first.
            </p>
          ) : (
            <>
              <div>
                <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Chart type
                </div>
                <div className="flex flex-wrap gap-1">
                  {CHART_MARKS.map((m) => (
                    <Button
                      key={m.id}
                      size="xs"
                      variant={chart.mark === m.id ? "secondary" : "outline"}
                      onClick={() => setMark(m.id)}
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
                <p
                  className="mt-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground"
                  data-testid="visualize-chart-help"
                >
                  {CHART_HELP[chart.mark]}
                </p>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {chart.mark !== "table" ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    {(
                      [
                        ["x", "X / category", "Label or date on the axis"],
                        ["y", "Y / value", "Number to plot (amount, units)"],
                        ["color", "Color", "Optional series / slice color"],
                        ["size", "Size (scatter)", "Optional point size"],
                      ] as const
                    ).map(([key, label, hint]) => (
                      <div key={key} className="grid gap-1 text-xs">
                        <span className="text-muted-foreground">
                          {label}
                          <span className="ml-1 font-normal opacity-80">
                            — {hint}
                          </span>
                        </span>
                        <SearchableColumnSelect
                          data-testid={`visualize-enc-${key}`}
                          value={chart.encoding[key]}
                          options={result.columns}
                          onChange={(v) => setEnc(key, v ?? "")}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No field mapping for table preview.
                  </p>
                )}
                <ChartMappingAnatomy
                  mark={chart.mark}
                  encoding={chart.encoding}
                />
              </div>

              <Button
                size="sm"
                className="self-start"
                disabled={!result}
                onClick={() => setStep("preview")}
              >
                Preview chart
              </Button>
            </>
          )}
        </div>
      ) : null}

      {step === "preview" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void runQuery()}
            >
              Refresh data
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStep("chart")}>
              Edit mapping
            </Button>
          </div>
          {!result ? (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          ) : chart.mark === "table" || !vlSpec ? (
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border text-xs">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {result.columns.map((c) => (
                      <th key={c} className="px-2 py-1 text-left font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-b border-border/60">
                      {r.map((cell, j) => (
                        <td key={j} className="px-2 py-0.5 font-mono">
                          {cell == null ? "NULL" : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              ref={chartHost}
              data-testid="visualize-chart-host"
              className="min-h-0 w-full flex-1 overflow-hidden rounded-md border border-border bg-card [&_.vega-embed]:h-full [&_.vega-embed]:w-full [&_.vega-embed]:max-w-none"
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
