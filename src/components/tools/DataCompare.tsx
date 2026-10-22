import { useEffect, useMemo, useState } from "react";
import type { QueryResult, SavedConnection } from "@/types";
import {
  ensureOpen,
  flattenTables,
  listSavedConnections,
  listSchema,
  quoteIdent,
  runSql,
} from "@/lib/dbApi";
import { compareRows, type RowDiff } from "@/lib/dataCompare";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ROW_CAP = 2000;

function quoteTable(engine: string, ref: string): string {
  return ref
    .split(".")
    .map((p) => quoteIdent(engine, p))
    .join(".");
}

export function DataCompare({ connection }: { connection: SavedConnection }) {
  const [saved, setSaved] = useState<SavedConnection[]>([]);
  const [tablesA, setTablesA] = useState<string[]>([]);
  const [tablesB, setTablesB] = useState<string[]>([]);
  const [connB, setConnB] = useState(connection.id);
  const [tableA, setTableA] = useState("");
  const [tableB, setTableB] = useState("");
  const [keys, setKeys] = useState<string[]>([]);
  const [keyPick, setKeyPick] = useState<string[]>([]);
  const [diffs, setDiffs] = useState<RowDiff[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    listSavedConnections()
      .then(setSaved)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    listSchema(connection.id)
      .then((s) => {
        const refs = flattenTables(s, connection.engine).map((t) => t.ref);
        setTablesA(refs);
        if (refs[0] && !tableA) setTableA(refs[0]);
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id]);

  useEffect(() => {
    const other = saved.find((c) => c.id === connB) ?? connection;
    let cancelled = false;
    (async () => {
      const restore = await ensureOpen(other.id, connection.id);
      try {
        const s = await listSchema(other.id);
        if (cancelled) return;
        const refs = flattenTables(s, other.engine).map((t) => t.ref);
        setTablesB(refs);
        if (refs[0] && !tableB) setTableB(refs[0]);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        await restore();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connB, saved, connection.id]);

  const engineB = useMemo(
    () => saved.find((c) => c.id === connB)?.engine ?? connection.engine,
    [saved, connB, connection.engine],
  );

  async function loadSide(
    connId: string,
    engine: string,
    table: string,
  ): Promise<QueryResult> {
    const sql = `SELECT * FROM ${quoteTable(engine, table)} LIMIT ${ROW_CAP}`;
    return runSql(sql, connId);
  }

  async function runCompare() {
    if (!tableA || !tableB || !keyPick.length) {
      setError("Pick tables and at least one key column");
      return;
    }
    setBusy(true);
    setError("");
    setDiffs(null);
    try {
      const restore = await ensureOpen(connB, connection.id);
      try {
        const a = await loadSide(connection.id, connection.engine, tableA);
        const b = await loadSide(connB, engineB, tableB);
        setKeys(a.columns);
        const d = compareRows(
          { columns: a.columns, rows: a.rows },
          { columns: b.columns, rows: b.rows },
          keyPick,
        );
        setDiffs(d);
        setStatus(
          `Compared up to ${ROW_CAP} rows/side — ${d.length} difference(s)`,
        );
      } finally {
        await restore();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // When table A loads keys for checkbox defaults
  useEffect(() => {
    if (!tableA) return;
    let cancelled = false;
    runSql(
      `SELECT * FROM ${quoteTable(connection.engine, tableA)} LIMIT 1`,
      connection.id,
    )
      .then((r) => {
        if (cancelled) return;
        setKeys(r.columns);
        if (!keyPick.length && r.columns[0]) setKeyPick([r.columns[0]]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableA, connection.id]);

  return (
    <div
      data-testid="data-compare"
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {status && !error ? (
        <p className="text-xs text-muted-foreground">{status}</p>
      ) : null}
      <div className="grid shrink-0 gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Side A (this connection)</Label>
          <select
            data-testid="data-compare-table-a"
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            value={tableA}
            onChange={(e) => setTableA(e.target.value)}
          >
            {tablesA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label>Side B connection</Label>
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            value={connB}
            onChange={(e) => setConnB(e.target.value)}
          >
            {saved.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.engine})
              </option>
            ))}
          </select>
          <select
            data-testid="data-compare-table-b"
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            value={tableB}
            onChange={(e) => setTableB(e.target.value)}
          >
            {tablesB.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="shrink-0">
        <Label>Key columns</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {keys.map((c) => (
            <label key={c} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={keyPick.includes(c)}
                onChange={(e) =>
                  setKeyPick((prev) =>
                    e.target.checked
                      ? [...prev, c]
                      : prev.filter((x) => x !== c),
                  )
                }
              />
              {c}
            </label>
          ))}
        </div>
      </div>
      <Button
        data-testid="data-compare-run"
        size="sm"
        className="self-start"
        disabled={busy}
        onClick={() => void runCompare()}
      >
        Compare
      </Button>
      <div className="min-h-0 flex-1 overflow-auto rounded border border-border">
        {diffs == null ? (
          <p className="p-3 text-sm text-muted-foreground">
            Cap {ROW_CAP} rows per side. Only-in-A / only-in-B / value diffs.
          </p>
        ) : diffs.length === 0 ? (
          <p className="p-3 text-sm text-emerald-700 dark:text-emerald-300">
            No differences in loaded rows.
          </p>
        ) : (
          <ul className="divide-y divide-border font-mono text-xs">
            {diffs.slice(0, 500).map((d, i) => (
              <li key={i} className="px-2 py-1.5">
                {d.kind === "onlyA" ? (
                  <span className="text-amber-700 dark:text-amber-300">
                    only A · {d.key}
                  </span>
                ) : null}
                {d.kind === "onlyB" ? (
                  <span className="text-sky-700 dark:text-sky-300">
                    only B · {d.key}
                  </span>
                ) : null}
                {d.kind === "diff" ? (
                  <span className="text-destructive">
                    diff · {d.key} · {d.columns.join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
