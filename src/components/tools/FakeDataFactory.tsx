import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm as confirmNative } from "@tauri-apps/plugin-dialog";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import type { SavedConnection } from "@/types";
import {
  describeTable,
  flattenTables,
  listSchema,
  shortName,
} from "@/lib/dbApi";
import { loadInboundFks } from "@/lib/relationInbound";
import {
  GENERATOR_KINDS,
  ROW_PRESETS,
  defaultColumnsFromDetails,
  kindLabel,
  missingFkParents,
  type FakeColumnSpec,
  type FakeDataPlan,
  type FakeDataResult,
  type FakeTableSpec,
  type FakeWriteMode,
} from "@/lib/fakeDataPlan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function FakeDataFactory({ connection }: { connection: SavedConnection }) {
  const engine = connection.engine;
  const canInsert = connection.permissions.allowInsert;
  const canTruncate =
    connection.permissions.allowDelete || connection.permissions.allowDdl;

  const [allTables, setAllTables] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [specs, setSpecs] = useState<Record<string, FakeTableSpec>>({});
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [mode, setMode] = useState<FakeWriteMode>("append");
  const [defaultRows, setDefaultRows] = useState(50);
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingSpec, setLoadingSpec] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<FakeDataResult | null>(null);

  const loadSchema = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const nodes = await listSchema(connection.id);
      setAllTables(flattenTables(nodes, engine).map((t) => t.ref));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [connection.id, engine]);

  useEffect(() => {
    void loadSchema();
  }, [loadSchema]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allTables;
    return allTables.filter((t) => t.toLowerCase().includes(q));
  }, [allTables, filter]);

  async function ensureSpec(table: string, rows = defaultRows) {
    let exists = false;
    setSpecs((prev) => {
      exists = !!prev[table];
      return prev;
    });
    if (exists) return;
    setLoadingSpec(true);
    try {
      const details = await describeTable(table, connection.id);
      const columns = defaultColumnsFromDetails(details, table);
      setSpecs((prev) => {
        if (prev[table]) return prev;
        return { ...prev, [table]: { table, rowCount: rows, columns } };
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingSpec(false);
    }
  }

  async function toggleTable(ref: string) {
    if (selected.includes(ref)) {
      setSelected((s) => s.filter((x) => x !== ref));
      setSpecs((prev) => {
        const next = { ...prev };
        delete next[ref];
        return next;
      });
      if (activeTable === ref) setActiveTable(null);
      return;
    }
    setSelected((s) => [...s, ref]);
    setActiveTable(ref);
    setResult(null);
    await ensureSpec(ref);
  }

  async function addRelated(table: string) {
    setBusy(true);
    setError("");
    try {
      const details = await describeTable(table, connection.id);
      const inbound = await loadInboundFks(engine, table, connection.id, allTables);
      const related = new Set<string>();
      const schema = table.includes(".")
        ? table.split(".").slice(0, -1).join(".")
        : null;
      const resolve = (r: string) =>
        r.includes(".") ? r : schema ? `${schema}.${r}` : r;
      for (const fk of details.foreignKeys) related.add(resolve(fk.refTable));
      for (const i of inbound) related.add(i.fromTable);
      related.delete(table);
      const toAdd = [...related].filter((r) => !selected.includes(r));
      if (!toAdd.length) {
        setLog((l) => [...l, `No related tables for ${shortName(table)}`]);
        return;
      }
      setSelected((s) => [...s, ...toAdd.filter((r) => !s.includes(r))]);
      for (const r of toAdd) await ensureSpec(r);
      setLog([`Added ${toAdd.length} related table(s): ${toAdd.map(shortName).join(", ")}`]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function patchSpec(table: string, patch: Partial<FakeTableSpec>) {
    setSpecs((prev) => ({
      ...prev,
      [table]: { ...prev[table], ...patch },
    }));
  }

  function patchColumn(table: string, colName: string, patch: Partial<FakeColumnSpec>) {
    setSpecs((prev) => {
      const spec = prev[table];
      if (!spec) return prev;
      return {
        ...prev,
        [table]: {
          ...spec,
          columns: spec.columns.map((c) =>
            c.name === colName ? { ...c, ...patch } : c,
          ),
        },
      };
    });
  }

  function applyRowsToAll(n: number) {
    setDefaultRows(n);
    setSpecs((prev) => {
      const next = { ...prev };
      for (const t of selected) {
        if (next[t]) next[t] = { ...next[t], rowCount: n };
      }
      return next;
    });
  }

  const plan: FakeDataPlan = useMemo(
    () => ({
      mode,
      seed: seed.trim() ? Number(seed) : undefined,
      tables: selected.map((t) => specs[t]).filter(Boolean),
    }),
    [mode, seed, selected, specs],
  );

  const totalRows = plan.tables.reduce((a, t) => a + t.rowCount, 0);
  const ready = plan.tables.length > 0 && plan.tables.length === selected.length;
  const missingParents = useMemo(
    () => missingFkParents(selected, specs),
    [selected, specs],
  );

  async function addMissingParents() {
    setBusy(true);
    setError("");
    try {
      const childMax = Math.max(
        defaultRows,
        ...selected.map((t) => specs[t]?.rowCount ?? defaultRows),
      );
      for (const p of missingParents) {
        if (!selected.includes(p)) {
          setSelected((s) => (s.includes(p) ? s : [...s, p]));
        }
        await ensureSpec(p, childMax);
        setSpecs((prev) => {
          const cur = prev[p];
          if (!cur) return prev;
          if (cur.rowCount >= childMax) return prev;
          return { ...prev, [p]: { ...cur, rowCount: childMax } };
        });
      }
      setLog([
        `Added parent table(s) with ${childMax} rows: ${missingParents.map(shortName).join(", ")}`,
      ]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!canInsert) {
      setError("INSERT is disabled for this connection");
      return;
    }
    if (!ready) {
      setError("Still loading table details…");
      return;
    }
    if (mode === "truncateFill") {
      if (!canTruncate) {
        setError("Clear-then-fill needs DELETE or DDL permission");
        return;
      }
      const ok = await confirmNative(
        `This deletes all rows in ${selected.length} table(s), then inserts fake data. Continue?`,
        { title: "Clear tables first?", kind: "warning" },
      );
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setLog(["Generating…"]);
    try {
      const res = await invoke<FakeDataResult>("generate_fake_data", {
        plan,
        connectionId: connection.id,
      });
      setResult(res);
      setLog(res.log);
    } catch (e) {
      setError(String(e));
      setLog((l) => [...l, String(e)]);
    } finally {
      setBusy(false);
    }
  }

  const active = activeTable ? specs[activeTable] : null;

  if (!canInsert) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          INSERT is disabled for this connection. Enable it in connection
          permissions to use Fake Data Factory.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div
      data-testid="fake-data-factory"
      className="flex h-full min-h-0 flex-col gap-3"
    >
      <div className="shrink-0 space-y-1">
        <p className="text-sm font-medium text-foreground">
          Fill tables with realistic fake rows
        </p>
        <p className="text-xs text-muted-foreground">
          Pick tables, choose how many rows, then generate. Columns are auto-mapped
          (emails, names, FKs). Fine-tune only if you need to.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_1fr]">
        {/* Table picker */}
        <section className="flex min-h-0 flex-col gap-2 rounded-md border border-border p-2">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-7 text-xs"
                placeholder="Search tables…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() => void loadSchema()}
              title="Refresh schema"
            >
              <RefreshCw className={cn("size-3", busy && "animate-spin")} />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {busy ? "Loading schema…" : "No tables match"}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((t) => {
                  const on = selected.includes(t);
                  return (
                    <li key={t}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60",
                          on && "bg-muted/80",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-3.5 accent-primary"
                          checked={on}
                          onChange={() => void toggleTable(t)}
                        />
                        <span className="min-w-0 flex-1 truncate font-mono">
                          {t}
                        </span>
                        {on ? (
                          <button
                            type="button"
                            className="shrink-0 text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                            onClick={(e) => {
                              e.preventDefault();
                              void addRelated(t);
                            }}
                            title="Also select parent and child tables linked by foreign keys"
                          >
                            + related
                          </button>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
            <Badge variant="secondary">{selected.length} selected</Badge>
            {selected.length > 0 ? (
              <button
                type="button"
                className="hover:text-foreground hover:underline"
                onClick={() => {
                  setSelected([]);
                  setSpecs({});
                  setActiveTable(null);
                  setResult(null);
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </section>

        {/* Selection + options */}
        <section className="flex min-h-0 flex-col gap-3 overflow-auto rounded-md border border-border p-3">
          {selected.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <Sparkles className="size-8 opacity-40" />
              <p className="text-sm">Select one or more tables on the left</p>
              <p className="max-w-xs text-xs">
                Tip: after picking a table, use <em>+ related</em> to include FK
                parents and children so references stay valid.
              </p>
            </div>
          ) : (
            <>
              {missingParents.length > 0 ? (
                <Alert>
                  <AlertDescription className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center">
                    <span className="min-w-0 flex-1">
                      Needs parent data from{" "}
                      <span className="font-mono">
                        {missingParents.map(shortName).join(", ")}
                      </span>
                      . Generate auto-creates enough parent rows for unique FKs,
                      or click Add parents to include them in the plan.
                    </span>
                    <Button
                      size="xs"
                      variant="outline"
                      className="shrink-0"
                      disabled={busy}
                      onClick={() => void addMissingParents()}
                    >
                      Add parents
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-[11px]">Rows per table</Label>
                  <div className="flex flex-wrap gap-1">
                    {ROW_PRESETS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={cn(
                          "rounded border border-border px-2 py-0.5 font-mono text-[11px] hover:bg-muted",
                          defaultRows === n && "bg-muted font-medium",
                        )}
                        onClick={() => applyRowsToAll(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {selected.map((t) => {
                    const spec = specs[t];
                    return (
                      <li
                        key={t}
                        className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {shortName(t)}
                        </span>
                        {!spec ? (
                          <Loader2 className="size-3 animate-spin text-muted-foreground" />
                        ) : (
                          <Input
                            className="h-7 w-20 font-mono text-xs"
                            type="number"
                            min={1}
                            max={100000}
                            value={spec.rowCount}
                            onChange={(e) =>
                              patchSpec(t, {
                                rowCount: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            aria-label={`Rows for ${shortName(t)}`}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px]">Write mode</Label>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <ModeCard
                    active={mode === "append"}
                    title="Append"
                    desc="Keep existing rows. New IDs continue after the current max."
                    onClick={() => setMode("append")}
                  />
                  <ModeCard
                    active={mode === "truncateFill"}
                    title="Clear, then fill"
                    desc="Delete all rows in selected tables, then insert fake data."
                    disabled={!canTruncate}
                    danger
                    onClick={() => canTruncate && setMode("truncateFill")}
                  />
                </div>
                {!canTruncate ? (
                  <p className="text-[10px] text-muted-foreground">
                    Clear-then-fill needs DELETE or DDL permission.
                  </p>
                ) : null}
              </div>

              <details className="group text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Advanced: reproducible seed
                </summary>
                <div className="mt-1.5 max-w-[12rem]">
                  <Input
                    className="h-8 font-mono text-xs"
                    placeholder="e.g. 42"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                  />
                </div>
              </details>

              <div className="border-t border-border pt-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-1 text-left text-xs font-medium hover:text-foreground"
                  onClick={() => {
                    const next = !showColumns;
                    setShowColumns(next);
                    if (next && !activeTable && selected[0]) {
                      setActiveTable(selected[0]);
                      void ensureSpec(selected[0]);
                    }
                  }}
                >
                  {showColumns ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                  Customize columns
                  <span className="ml-1 font-normal text-muted-foreground">
                    (optional — defaults usually work)
                  </span>
                </button>
                {showColumns ? (
                  <div className="mt-2 grid min-h-0 gap-2 sm:grid-cols-[140px_1fr]">
                    <div className="max-h-48 overflow-auto rounded border border-border sm:max-h-64">
                      {selected.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={cn(
                            "block w-full truncate px-2 py-1.5 text-left font-mono text-[11px] hover:bg-muted",
                            activeTable === t && "bg-muted",
                          )}
                          onClick={() => {
                            void ensureSpec(t);
                            setActiveTable(t);
                          }}
                        >
                          {shortName(t)}
                        </button>
                      ))}
                    </div>
                    <div className="max-h-48 overflow-auto rounded border border-border sm:max-h-64">
                      {loadingSpec && !active ? (
                        <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" /> Loading…
                        </p>
                      ) : active && activeTable ? (
                        <table className="w-full text-left text-[11px]">
                          <thead className="sticky top-0 bg-muted/90">
                            <tr>
                              <th className="px-2 py-1 font-medium">Column</th>
                              <th className="px-2 py-1 font-medium">Generator</th>
                              <th className="px-2 py-1 font-medium">Options</th>
                            </tr>
                          </thead>
                          <tbody>
                            {active.columns.map((c) => (
                              <ColumnRow
                                key={c.name}
                                col={c}
                                onPatch={(patch) =>
                                  patchColumn(activeTable, c.name, patch)
                                }
                              />
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="p-3 text-xs text-muted-foreground">
                          Pick a table to edit generators.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Action bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border pt-2">
        <p className="text-xs text-muted-foreground">
          {ready ? (
            <>
              Ready to{" "}
              <span className="text-foreground">
                {mode === "append" ? "append" : "clear & insert"}
              </span>{" "}
              <strong className="font-mono text-foreground">{totalRows}</strong>{" "}
              rows into{" "}
              <strong className="font-mono text-foreground">
                {plan.tables.length}
              </strong>{" "}
              table{plan.tables.length === 1 ? "" : "s"}
            </>
          ) : selected.length ? (
            "Loading column defaults…"
          ) : (
            "Select tables to begin"
          )}
        </p>
        <Button
          size="sm"
          className="ml-auto"
          disabled={busy || !ready}
          onClick={() => void run()}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          Generate
        </Button>
      </div>

      {result || log.length > 0 ? (
        <div className="flex max-h-40 shrink-0 flex-col gap-1 rounded-md border border-border bg-card/40 p-2">
          {result ? (
            <p className="flex items-center gap-1.5 text-xs">
              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Inserted <strong>{result.rows}</strong> rows across{" "}
              <strong>{result.tables}</strong> tables
            </p>
          ) : null}
          <pre className="overflow-auto font-mono text-[10px] text-muted-foreground">
            {log.join("\n")}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function ModeCard({
  active,
  title,
  desc,
  disabled,
  danger,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-2 text-left transition-colors",
        active
          ? danger
            ? "border-destructive/50 bg-destructive/10"
            : "border-primary/40 bg-muted"
          : "border-border hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <div className="text-xs font-medium">{title}</div>
      <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
        {desc}
      </div>
    </button>
  );
}

function ColumnRow({
  col,
  onPatch,
}: {
  col: FakeColumnSpec;
  onPatch: (patch: Partial<FakeColumnSpec>) => void;
}) {
  return (
    <tr className="border-t border-border">
      <td className="px-2 py-1 align-top font-mono">
        {col.name}
        {col.unique ? (
          <span className="ml-1 text-[9px] font-sans font-normal text-muted-foreground">
            unique
          </span>
        ) : null}
      </td>
      <td className="px-2 py-1 align-top">
        <select
          className="h-7 w-full max-w-[11rem] rounded border border-border bg-background px-1 text-[10px]"
          value={col.kind}
          onChange={(e) => onPatch({ kind: e.target.value })}
        >
          {GENERATOR_KINDS.map((k) => (
            <option key={k} value={k}>
              {kindLabel(k)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1 align-top">
        {col.kind === "fixed" ? (
          <Input
            className="h-7 font-mono text-[10px]"
            placeholder="value"
            value={col.value ?? ""}
            onChange={(e) => onPatch({ value: e.target.value })}
          />
        ) : null}
        {col.kind === "fk" ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            → {col.refTable ?? "?"}.{col.refColumn ?? "?"}
            {col.unique ? " · one each" : ""}
          </span>
        ) : null}
        {col.kind === "int" || col.kind === "float" ? (
          <div className="flex gap-1">
            <Input
              className="h-7 w-16 font-mono text-[10px]"
              placeholder="min"
              value={col.min ?? ""}
              onChange={(e) => onPatch({ min: Number(e.target.value) })}
            />
            <Input
              className="h-7 w-16 font-mono text-[10px]"
              placeholder="max"
              value={col.max ?? ""}
              onChange={(e) => onPatch({ max: Number(e.target.value) })}
            />
          </div>
        ) : null}
        {col.kind === "sequence" ? (
          <span className="text-[10px] text-muted-foreground">
            starts at {col.start ?? 1}
            <span className="text-muted-foreground/70"> (bumped on append)</span>
          </span>
        ) : null}
        {col.kind === "enum" ? (
          <Input
            className="h-7 font-mono text-[10px]"
            placeholder="a, b, c"
            value={(col.values ?? []).join(", ")}
            onChange={(e) =>
              onPatch({
                values: e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          />
        ) : null}
        {col.kind === "skip" ? (
          <span className="text-[10px] text-muted-foreground">DB default / identity</span>
        ) : null}
        {col.kind === "auto" ? (
          <span className="text-[10px] text-muted-foreground">from name + type</span>
        ) : null}
      </td>
    </tr>
  );
}
