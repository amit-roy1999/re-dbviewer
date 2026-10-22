import { useState } from "react";
import type { QueryResult, SavedConnection } from "@/types";
import { runSql } from "@/lib/dbApi";
import { pivotResult } from "@/lib/pivotResult";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AdminTable } from "@/components/tools/AdminTable";

export function PivotTool({ connection }: { connection: SavedConnection }) {
  const [sql, setSql] = useState("SELECT 1 AS r, 'a' AS c, 10 AS v");
  const [rowKey, setRowKey] = useState("r");
  const [colKey, setColKey] = useState("c");
  const [valKey, setValKey] = useState("v");
  const [agg, setAgg] = useState<"sum" | "count" | "first">("sum");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError("");
    try {
      const raw = await runSql(sql, connection.id);
      setResult(pivotResult(raw, rowKey, colKey, valKey, agg));
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="pivot-tool"
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Label>Source SQL</Label>
      <textarea
        className="min-h-24 rounded border border-input bg-transparent p-2 font-mono text-xs"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
      />
      <div className="flex flex-wrap gap-2 text-xs">
        <label>
          Row{" "}
          <input
            className="h-7 rounded border border-input px-1"
            value={rowKey}
            onChange={(e) => setRowKey(e.target.value)}
          />
        </label>
        <label>
          Column{" "}
          <input
            className="h-7 rounded border border-input px-1"
            value={colKey}
            onChange={(e) => setColKey(e.target.value)}
          />
        </label>
        <label>
          Value{" "}
          <input
            className="h-7 rounded border border-input px-1"
            value={valKey}
            onChange={(e) => setValKey(e.target.value)}
          />
        </label>
        <select
          className="h-7 rounded border border-input px-1"
          value={agg}
          onChange={(e) => setAgg(e.target.value as typeof agg)}
        >
          <option value="sum">sum</option>
          <option value="count">count</option>
          <option value="first">first</option>
        </select>
        <Button size="sm" disabled={busy} onClick={() => void run()}>
          Pivot
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <AdminTable result={result} />
      </div>
    </div>
  );
}
