import { useState } from "react";
import type { QueryResult } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PinnedResult = { sql: string; result: QueryResult };

type Props = {
  current: QueryResult;
  currentSql: string;
  pinned: PinnedResult | null;
  onPin: () => void;
  onUnpin: () => void;
};

/** Pin the current result, then compare column names / row counts against a later one. */
export function ResultPinBar({ current, currentSql, pinned, onPin, onUnpin }: Props) {
  const [open, setOpen] = useState(false);
  const all = pinned
    ? [...new Set([...pinned.result.columns, ...current.columns])]
    : [];
  const delta = pinned ? current.rows.length - pinned.result.rows.length : 0;

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-muted/20 px-3 py-0.5 text-[11px]">
      <Button size="xs" variant="ghost" onClick={onPin}>
        Pin result
      </Button>
      {pinned ? (
        <>
          <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
            Compare pinned
          </Button>
          <Button size="xs" variant="ghost" onClick={onUnpin}>
            Unpin
          </Button>
          <span className="truncate text-muted-foreground">
            pinned: {pinned.result.rows.length} rows · {pinned.result.columns.length} cols
          </span>
        </>
      ) : null}
      <Dialog open={open && pinned != null} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Compare pinned result</DialogTitle>
          </DialogHeader>
          {pinned ? (
            <div className="grid gap-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Pinned", pinned.sql, pinned.result],
                  ["Current", currentSql, current],
                ].map(([label, sql, r]) => (
                  <div key={label as string} className="min-w-0 rounded border border-border p-2">
                    <div className="font-medium">
                      {label as string}: {(r as QueryResult).rows.length} rows,{" "}
                      {(r as QueryResult).columns.length} columns
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {(sql as string).replace(/\s+/g, " ")}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                Row count difference:{" "}
                <span className="font-mono">{delta > 0 ? `+${delta}` : delta}</span>
              </div>
              <div className="max-h-72 overflow-auto rounded border border-border">
                <table className="w-full font-mono">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Pinned column</th>
                      <th className="px-2 py-1 text-left font-medium">Current column</th>
                      <th className="px-2 py-1 text-left font-medium">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {all.map((c) => {
                      const a = pinned.result.columns.includes(c);
                      const b = current.columns.includes(c);
                      return (
                        <tr key={c} className="border-t border-border/60">
                          <td className="px-2 py-1">{a ? c : "—"}</td>
                          <td className="px-2 py-1">{b ? c : "—"}</td>
                          <td
                            className={
                              a && b ? "px-2 py-1 text-muted-foreground" : "px-2 py-1 text-destructive"
                            }
                          >
                            {a && b ? "same" : a ? "only pinned" : "only current"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
