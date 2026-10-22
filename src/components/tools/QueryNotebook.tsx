import { useState } from "react";
import type { SavedConnection } from "@/types";
import { runSql } from "@/lib/dbApi";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Cell = { id: string; sql: string; out: string };

export function QueryNotebook({ connection }: { connection: SavedConnection }) {
  const [cells, setCells] = useState<Cell[]>([
    { id: "1", sql: "SELECT 1 AS ok;", out: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function addCell() {
    setCells((c) => [
      ...c,
      { id: String(Date.now()), sql: "", out: "" },
    ]);
  }

  async function runCell(id: string) {
    const cell = cells.find((c) => c.id === id);
    if (!cell?.sql.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await runSql(cell.sql, connection.id);
      const preview = [
        r.columns.join(" | "),
        ...r.rows.slice(0, 20).map((row) => row.map(String).join(" | ")),
        r.rows.length > 20 ? `… ${r.rows.length} rows` : "",
      ]
        .filter(Boolean)
        .join("\n");
      setCells((prev) =>
        prev.map((c) => (c.id === id ? { ...c, out: preview } : c)),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runAll() {
    for (const c of cells) {
      if (c.sql.trim()) await runCell(c.id);
    }
  }

  return (
    <div
      data-testid="query-notebook"
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex gap-1">
        <Button size="sm" disabled={busy} onClick={() => void runAll()}>
          Run all
        </Button>
        <Button size="sm" variant="outline" onClick={addCell}>
          Add cell
        </Button>
      </div>
      {cells.map((c, i) => (
        <div
          key={c.id}
          className="grid gap-1 rounded border border-border p-2"
        >
          <label className="text-xs text-muted-foreground">Cell {i + 1}</label>
          <textarea
            className="min-h-20 rounded border border-input bg-transparent p-2 font-mono text-xs"
            value={c.sql}
            onChange={(e) =>
              setCells((prev) =>
                prev.map((x) =>
                  x.id === c.id ? { ...x, sql: e.target.value } : x,
                ),
              )
            }
          />
          <Button
            size="xs"
            className="self-start"
            disabled={busy}
            onClick={() => void runCell(c.id)}
          >
            Run cell
          </Button>
          {c.out ? (
            <pre className="max-h-40 overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px]">
              {c.out}
            </pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}
