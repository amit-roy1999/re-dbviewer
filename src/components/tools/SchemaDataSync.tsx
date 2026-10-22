import { useEffect, useState } from "react";
import type { SavedConnection } from "@/types";
import {
  ensureOpen,
  listSavedConnections,
  quoteIdent,
  runSql,
} from "@/lib/dbApi";
import { loadEerModel } from "@/lib/eerModel";
import { snapshotFromModel } from "@/lib/schemaCompare";
import { buildSyncPlan, type SyncPlan } from "@/lib/schemaDataSync";
import { migrateTables } from "@/lib/migrate";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";

async function countRows(
  connId: string,
  engine: string,
  tableRef: string,
): Promise<number> {
  const q = tableRef
    .split(".")
    .map((p) => quoteIdent(engine, p))
    .join(".");
  const r = await runSql(`SELECT COUNT(*) AS c FROM ${q}`, connId);
  const v = r.rows[0]?.[0];
  return typeof v === "number" ? v : Number(v) || 0;
}

export function SchemaDataSync({ connection }: { connection: SavedConnection }) {
  const [saved, setSaved] = useState<SavedConnection[]>([]);
  const [targetId, setTargetId] = useState("");
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    listSavedConnections()
      .then((l) => setSaved(l.filter((c) => c.id !== connection.id)))
      .catch((e) => setError(String(e)));
  }, [connection.id]);

  async function analyze() {
    const target = saved.find((c) => c.id === targetId);
    if (!target) {
      setError("Pick a target connection");
      return;
    }
    setBusy(true);
    setError("");
    setPlan(null);
    setLog([]);
    try {
      const done = await ensureOpen(targetId, connection.id);
      try {
        const modelA = (
          await loadEerModel(connection.id, connection.engine, null, 200)
        ).model;
        const modelB = (
          await loadEerModel(targetId, target.engine, null, 200)
        ).model;
        const snapA = snapshotFromModel(modelA);
        const snapB = snapshotFromModel(modelB);
        const nameToRef: Record<string, string> = {};
        for (const t of modelA.tables) nameToRef[t.name.toLowerCase()] = t.ref;

        const shared = modelA.tables.filter((t) =>
          modelB.tables.some(
            (u) => u.name.toLowerCase() === t.name.toLowerCase(),
          ),
        );
        const rowCounts: Record<string, { a: number; b: number }> = {};
        // ponytail: sample up to 20 shared tables for count hints
        for (const t of shared.slice(0, 20)) {
          const bRef =
            modelB.tables.find(
              (u) => u.name.toLowerCase() === t.name.toLowerCase(),
            )?.ref ?? t.ref;
          try {
            const a = await countRows(connection.id, connection.engine, t.ref);
            const b = await countRows(targetId, target.engine, bRef);
            rowCounts[t.name] = { a, b };
          } catch {
            /* skip uncountable */
          }
        }

        const p = buildSyncPlan(snapA, snapB, nameToRef, rowCounts);
        setPlan(p);
        setPicked(new Set(p.missingOnB));
      } finally {
        await done();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pushMissing() {
    const target = saved.find((c) => c.id === targetId);
    if (!target || !plan) return;
    const tables = plan.missingOnB.filter((t) => picked.has(t));
    if (!tables.length) {
      setError("No tables selected to push");
      return;
    }
    setBusy(true);
    setError("");
    setLog([]);
    try {
      const closers = [
        await ensureOpen(connection.id, connection.id),
        await ensureOpen(targetId, connection.id),
      ];
      try {
        const lines: string[] = [];
        await migrateTables(
          {
            sourceId: connection.id,
            sourceEngine: connection.engine,
            targetId,
            targetEngine: target.engine,
            tables,
            copySchema: true,
            copyData: true,
            dropExisting: false,
            batchSize: 500,
            typeMap: [],
          },
          (line) => lines.push(line),
          () => false,
          (m) => setProgress(m),
        );
        setLog(lines);
        setProgress("");
        await analyze();
      } finally {
        for (const c of closers.reverse()) await c();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="schema-data-sync"
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label>Target (B) — push missing from this connection (A)</Label>
          <select
            data-testid="schema-sync-target"
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="">Pick…</option>
            {saved.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.engine})
              </option>
            ))}
          </select>
        </div>
        <Button
          size="sm"
          data-testid="schema-sync-analyze"
          disabled={busy || !targetId}
          onClick={() => void analyze()}
        >
          Analyze
        </Button>
        <Button
          size="sm"
          data-testid="schema-sync-push"
          disabled={busy || !plan || picked.size === 0}
          onClick={() => void pushMissing()}
        >
          Push missing tables + data
        </Button>
      </div>
      {progress ? (
        <p className="text-xs text-muted-foreground">{progress}</p>
      ) : null}
      {plan ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-auto text-xs">
          <section>
            <p className="mb-1 font-medium">
              Missing on B ({plan.missingOnB.length}) — will create + copy
            </p>
            {plan.missingOnB.length === 0 ? (
              <p className="text-muted-foreground">None</p>
            ) : (
              <ul className="space-y-0.5">
                {plan.missingOnB.map((t) => (
                  <li key={t}>
                    <label className="flex items-center gap-1 font-mono">
                      <input
                        type="checkbox"
                        checked={picked.has(t)}
                        onChange={(e) =>
                          setPicked((prev) => {
                            const n = new Set(prev);
                            if (e.target.checked) n.add(t);
                            else n.delete(t);
                            return n;
                          })
                        }
                      />
                      {t}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <p className="mb-1 font-medium">Only on B ({plan.onlyOnB.length})</p>
            <p className="font-mono text-muted-foreground">
              {plan.onlyOnB.length ? plan.onlyOnB.join(", ") : "None"}
            </p>
          </section>
          <section>
            <p className="mb-1 font-medium">
              Column conflicts ({plan.columnConflicts.length})
            </p>
            {plan.columnConflicts.length === 0 ? (
              <p className="text-muted-foreground">None</p>
            ) : (
              <ul className="font-mono">
                {plan.columnConflicts.slice(0, 50).map((d, i) => (
                  <li key={i}>
                    {d.kind}: {d.table}
                    {d.column ? `.${d.column}` : ""}
                    {d.detail ? ` (${d.detail})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <p className="mb-1 font-medium">
              Row-count mismatches ({plan.rowCountHints.length})
            </p>
            {plan.rowCountHints.length === 0 ? (
              <p className="text-muted-foreground">None in sample</p>
            ) : (
              <ul className="font-mono">
                {plan.rowCountHints.map((h) => (
                  <li key={h.table}>
                    {h.table}: A={h.countA} B={h.countB}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          One-way A→B: report missing tables, column diffs, and row-count
          mismatches; optionally push missing tables (schema + data).
        </p>
      )}
      {log.length ? (
        <pre className="max-h-24 overflow-auto rounded border border-border p-2 font-mono text-xs">
          {log.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}
