import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SavedConnection } from "@/types";
import {
  ensureOpen,
  flattenTables,
  listSavedConnections,
  listSchema,
  type TableEntry,
} from "@/lib/dbApi";
import { migrateTables } from "@/lib/migrate";
import { defaultTypeMap, type TypeRule } from "@/lib/typeMap";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const sel =
  "h-7 rounded-lg border border-input bg-transparent px-2 text-xs dark:bg-input/30 dark:[color-scheme:dark]";

export function MigrationWizard({ connection }: { connection: SavedConnection }) {
  const [saved, setSaved] = useState<SavedConnection[]>([]);
  const [sourceId, setSourceId] = useState(connection.id);
  const [targetId, setTargetId] = useState("");
  const [tables, setTables] = useState<TableEntry[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [copySchema, setCopySchema] = useState(true);
  const [copyData, setCopyData] = useState(true);
  const [dropExisting, setDropExisting] = useState(false);
  const [batch, setBatch] = useState(500);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [rules, setRules] = useState<TypeRule[]>([]);
  const cancel = useRef(false);

  useEffect(() => {
    listSavedConnections().then(setSaved).catch((e) => setError(String(e)));
  }, []);

  const source = saved.find((c) => c.id === sourceId);
  const target = saved.find((c) => c.id === targetId);
  const targetEngine = target?.engine;
  const crossEngine = !!source && !!target && source.engine !== target.engine;

  useEffect(() => {
    if (targetEngine) setRules(defaultTypeMap(targetEngine));
  }, [targetEngine]);

  async function loadTables() {
    if (!source) return;
    setError("");
    setBusy(true);
    try {
      const done = await ensureOpen(sourceId, connection.id);
      try {
        const list = flattenTables(await listSchema(sourceId), source.engine);
        setTables(list);
        setPicked(new Set(list.map((t) => t.ref)));
      } finally {
        await done();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!source || !target) return;
    if (source.id === target.id) {
      setError("Source and target must differ.");
      return;
    }
    if (!copySchema && !copyData) {
      setError("Pick schema and/or data.");
      return;
    }
    cancel.current = false;
    setBusy(true);
    setError("");
    setLog([]);
    setProgress("");
    const closers: (() => Promise<void>)[] = [];
    try {
      closers.push(await ensureOpen(sourceId, connection.id));
      closers.push(await ensureOpen(targetId, connection.id));
      const res = await migrateTables(
        {
          sourceId,
          sourceEngine: source.engine,
          targetId,
          targetEngine: target.engine,
          tables: [...picked],
          copySchema,
          copyData,
          dropExisting,
          batchSize: Math.max(1, batch),
          typeMap: rules,
        },
        (l) => setLog((p) => [...p, l]),
        () => cancel.current,
        setProgress,
      );
      setLog((p) => [...p, `Done: ${res.tables} tables, ${res.rows} rows.`]);
    } catch (e) {
      setError(String(e));
    } finally {
      for (const c of closers.reverse()) await c();
      setBusy(false);
    }
  }

  const connSelect = (v: string, set: (s: string) => void, blank: string) => (
    <select className={sel} value={v} onChange={(e) => { set(e.target.value); setTables([]); }}>
      <option value="">{blank}</option>
      {saved.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.engine})
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span>Source</span> {connSelect(sourceId, setSourceId, "Pick source…")}
        <span>→ Target</span> {connSelect(targetId, setTargetId, "Pick target…")}
        <Button size="sm" variant="outline" disabled={!source || busy} onClick={() => void loadTables()}>
          List tables
        </Button>
      </div>
      {source && target && source.engine !== target.engine ? (
        <Alert>
          <AlertDescription>
            Engines differ ({source.engine} → {target.engine}). Tables are
            created from column names, mapped types (below), NOT NULL and primary
            keys only; defaults, auto-increment, indexes and foreign keys are not carried over.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={copySchema} onChange={(e) => setCopySchema(e.target.checked)} />
          Create tables
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={copyData} onChange={(e) => setCopyData(e.target.checked)} />
          Copy data
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={dropExisting} onChange={(e) => setDropExisting(e.target.checked)} />
          Drop existing target tables first
        </label>
        <label className="flex items-center gap-1.5">
          Batch
          <input
            type="number"
            min={1}
            className="h-6 w-20 rounded border border-input bg-transparent px-1"
            value={batch}
            onChange={(e) => setBatch(Number(e.target.value) || 1)}
          />
        </label>
      </div>
      {crossEngine ? (
        <details className="rounded-md border border-border p-2 text-xs">
          <summary className="cursor-pointer font-medium">
            Type mapping ({rules.length} rules)
          </summary>
          <div className="mt-2 grid max-h-32 gap-1 overflow-auto sm:grid-cols-2">
            {rules.map((r, i) => (
              <div key={i} className="flex items-center gap-1">
                <input
                  className="h-6 min-w-0 flex-1 rounded border border-input bg-transparent px-1 font-mono"
                  value={r.from}
                  onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
                />
                →
                <input
                  className="h-6 min-w-0 flex-1 rounded border border-input bg-transparent px-1 font-mono"
                  value={r.to}
                  onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
                />
                <Button size="xs" variant="ghost" onClick={() => setRules(rules.filter((_, j) => j !== i))}>
                  ×
                </Button>
              </div>
            ))}
          </div>
          <Button size="xs" variant="outline" className="mt-2" onClick={() => setRules([...rules, { from: "", to: "" }])}>
            Add rule
          </Button>
        </details>
      ) : null}
      {progress ? (
        <div className="font-mono text-xs text-muted-foreground">{progress}</div>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-1 rounded-md border border-border p-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium">Tables ({picked.size}/{tables.length})</span>
            <Button size="xs" variant="ghost" onClick={() => setPicked(new Set(tables.map((t) => t.ref)))}>all</Button>
            <Button size="xs" variant="ghost" onClick={() => setPicked(new Set())}>none</Button>
          </div>
          <ul className="min-h-0 flex-1 overflow-auto font-mono text-xs">
            {tables.map((t) => (
              <li key={t.ref}>
                <label className="flex items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={picked.has(t.ref)}
                    onChange={(e) => {
                      const n = new Set(picked);
                      if (e.target.checked) n.add(t.ref);
                      else n.delete(t.ref);
                      setPicked(n);
                    }}
                  />
                  {t.ref}
                </label>
              </li>
            ))}
            {tables.length === 0 ? (
              <li className="text-muted-foreground">Pick a source and list tables.</li>
            ) : null}
          </ul>
        </div>
        <div className="flex min-h-0 flex-col gap-1 rounded-md border border-border p-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            Log
            <Button
              size="xs"
              className="ml-auto"
              disabled={busy || !target || picked.size === 0}
              onClick={() => void run()}
            >
              {busy ? "Running…" : "Start migration"}
            </Button>
            {busy ? (
              <Button size="xs" variant="outline" onClick={() => (cancel.current = true)}>
                Cancel
              </Button>
            ) : null}
            <Button
              size="xs"
              variant="ghost"
              disabled={log.length === 0}
              onClick={() => void invoke("write_clipboard", { text: log.join("\n") })}
            >
              Copy
            </Button>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
            {log.join("\n")}
          </pre>
        </div>
      </div>
    </div>
  );
}
