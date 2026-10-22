import { useEffect, useState } from "react";
import type { SavedConnection, TableDetails } from "@/types";
import { describeTable, flattenTables, listSchema } from "@/lib/dbApi";
import { useWorkspaceActions } from "@/lib/workspaceActions";
import { RelationQueryBuilder } from "@/components/RelationQueryBuilder";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";

/** Tools → Visual Query Builder: pick a root table, join via FKs, open SQL. */
export function VisualQueryBuilder({
  connection,
}: {
  connection: SavedConnection;
}) {
  const actions = useWorkspaceActions();
  const [tables, setTables] = useState<{ ref: string; name: string }[]>([]);
  const [root, setRoot] = useState("");
  const [graphKey, setGraphKey] = useState(0);
  const [details, setDetails] = useState<TableDetails | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSchema(connection.id)
      .then((schema) => {
        if (cancelled) return;
        const flat = flattenTables(schema, connection.engine);
        setTables(flat.map((t) => ({ ref: t.ref, name: t.name })));
        if (flat[0] && !root) setRoot(flat[0].ref);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id, connection.engine]);

  useEffect(() => {
    if (!root) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError("");
    describeTable(root, connection.id)
      .then((d) => {
        if (!cancelled) setDetails(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setDetails(null);
          setError(String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [root, connection.id]);

  return (
    <div
      data-testid="visual-query-builder"
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-end gap-2 shrink-0">
        <div className="grid gap-1">
          <Label htmlFor="vqb-root">Root table</Label>
          <select
            id="vqb-root"
            data-testid="vqb-root-table"
            className="h-8 min-w-[220px] rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={root}
            onChange={(e) => setRoot(e.target.value)}
          >
            {tables.map((t) => (
              <option key={t.ref} value={t.ref}>
                {t.ref}
              </option>
            ))}
          </select>
        </div>
        <p className="pb-1 text-[11px] text-muted-foreground">
          Include related tables, pick columns / filters, then open the SQL in a
          query tab.
        </p>
      </div>
      {busy && !details ? (
        <p className="text-sm text-muted-foreground">Loading table…</p>
      ) : null}
      {details && root ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <RelationQueryBuilder
            key={`${root}-${graphKey}`}
            table={root}
            engine={connection.engine}
            connectionId={connection.id}
            details={details}
            primaryActionLabel="Open in query tab"
            onPrimaryAction={(sql) => {
              actions?.openSqlInTab?.(sql);
            }}
            onOpenSql={(sql) => actions?.openSqlInTab?.(sql)}
          />
        </div>
      ) : null}
      {!busy && tables.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tables in schema.</p>
      ) : null}
      {root && details ? (
        <div className="shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setGraphKey((k) => k + 1)}
          >
            Reset graph
          </Button>
        </div>
      ) : null}
    </div>
  );
}
