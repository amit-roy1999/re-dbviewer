import { useMemo, useState, type ReactNode } from "react";
import type { QueryResult } from "@/types";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCellDisplay } from "@/lib/cellFormat";
import { cn } from "@/lib/utils";

const cell = (v: unknown) =>
  v === null || v === undefined ? "NULL" : formatCellDisplay(v);

/** Searchable read-only table over a QueryResult, with an optional trailing action column. */
export function AdminTable({
  result,
  actionLabel,
  action,
  emptyText = "No rows.",
  /** When true, grow to fill a flex parent (single-table panes). Default stacks safely. */
  fill = false,
}: {
  result: QueryResult | null;
  actionLabel?: string;
  action?: (row: unknown[], cols: string[]) => ReactNode;
  emptyText?: string;
  fill?: boolean;
}) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    if (!result) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return result.rows;
    return result.rows.filter((r) =>
      r.some((c) => cell(c).toLowerCase().includes(needle)),
    );
  }, [result, q]);

  if (!result) return null;
  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        fill ? "min-h-0 flex-1" : "shrink-0",
      )}
    >
      <div className="flex shrink-0 items-center gap-2">
        <Input
          className="h-7 max-w-xs text-xs"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          {rows.length} / {result.rows.length} rows
        </span>
      </div>
      <div
        className={cn(
          "overflow-auto rounded-md border border-border",
          fill ? "min-h-0 flex-1" : "max-h-72",
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              {result.columns.map((c) => (
                <TableHead key={c} className="whitespace-nowrap text-xs">
                  {c}
                </TableHead>
              ))}
              {action ? (
                <TableHead className="text-xs">{actionLabel}</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                {r.map((c, j) => (
                  <TableCell
                    key={j}
                    className="max-w-[28rem] truncate font-mono text-[11px]"
                    title={cell(c)}
                  >
                    {cell(c)}
                  </TableCell>
                ))}
                {action ? (
                  <TableCell>{action(r, result.columns)}</TableCell>
                ) : null}
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={result.columns.length + (action ? 1 : 0)}
                  className="text-center text-xs text-muted-foreground"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
