import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { SchemaNode } from "@/types";
import { quoteIdent, runSql, tableRef } from "@/lib/dbApi";
import { isMysqlLike } from "@/lib/objectDdl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SYS = "'mysql','information_schema','performance_schema','sys'";
/** Cap for the exact COUNT(*) fallback (one query per table). */
const COUNT_CAP = 40;

type Row = { schema: string; table: string; rows: number | null };

/** Best-effort row counts: catalog estimates on MySQL / Postgres, capped COUNT(*) elsewhere. */
async function loadCounts(
  engine: string,
  connectionId: string,
  schema: SchemaNode[],
): Promise<{ rows: Row[]; approx: boolean; note: string }> {
  const estimate = isMysqlLike(engine)
    ? `SELECT table_schema, table_name, table_rows FROM information_schema.tables WHERE table_schema NOT IN (${SYS}) AND table_type = 'BASE TABLE' ORDER BY table_rows DESC LIMIT 200`
    : engine === "postgres"
      ? "SELECT schemaname::text, relname::text, n_live_tup::bigint FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 200"
      : null;
  if (estimate) {
    try {
      const r = await runSql(estimate, connectionId);
      return {
        rows: r.rows.map((x) => ({
          schema: String(x[0]),
          table: String(x[1]),
          rows: x[2] == null ? null : Number(x[2]),
        })),
        approx: true,
        note: "Approximate counts from the server catalog (top 200 tables).",
      };
    } catch {
      // fall through to exact counts
    }
  }
  const all = schema.flatMap((s) =>
    s.children
      .filter((c) => c.kind !== "view")
      .map((c) => ({ schema: s.name, name: c.name })),
  );
  const rows: Row[] = [];
  for (const t of all.slice(0, COUNT_CAP)) {
    let n: number | null = null;
    try {
      const r = await runSql(
        `SELECT COUNT(*) FROM ${quoteIdent(engine, tableRef(t.schema, t.name, engine))}`,
        connectionId,
      );
      n = Number(r.rows[0]?.[0] ?? 0);
    } catch {
      // unreadable table: leave blank
    }
    rows.push({ schema: t.schema, table: t.name, rows: n });
  }
  return {
    rows,
    approx: false,
    note:
      all.length > COUNT_CAP
        ? `Exact COUNT(*) for the first ${COUNT_CAP} of ${all.length} tables.`
        : "Exact COUNT(*) per table.",
  };
}

/** D5: schema-wide table list with (approximate) row counts. */
export function SchemaInspectorDialog({
  open,
  engine,
  connectionId,
  schema,
  onClose,
  onOpenTable,
}: {
  open: boolean;
  engine: string;
  connectionId: string;
  schema: SchemaNode[];
  onClose: () => void;
  onOpenTable: (ref: string) => void;
}) {
  const [state, setState] = useState<{
    rows: Row[];
    approx: boolean;
    note: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let dead = false;
    setState(null);
    void loadCounts(engine, connectionId, schema).then((s) => {
      if (!dead) setState(s);
    });
    return () => {
      dead = true;
    };
    // schema is a snapshot at open time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, engine, connectionId]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Schema inspector
            {!state ? <Loader2 className="size-3.5 animate-spin" /> : null}
          </DialogTitle>
        </DialogHeader>
        {state ? (
          <>
            <p className="text-xs text-muted-foreground">
              {state.rows.length} table(s) · {state.note}
            </p>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Schema</TableHead>
                    <TableHead className="text-xs">Table</TableHead>
                    <TableHead className="text-right text-xs">
                      Rows{state.approx ? " (≈)" : ""}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.rows.map((r) => {
                    const ref = tableRef(r.schema, r.table, engine);
                    return (
                      <TableRow
                        key={`${r.schema}.${r.table}`}
                        className="cursor-pointer"
                        onClick={() => {
                          onOpenTable(ref);
                          onClose();
                        }}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {r.schema}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.table}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {r.rows ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
