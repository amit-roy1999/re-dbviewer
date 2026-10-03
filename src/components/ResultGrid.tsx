import { memo } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, KeyRound } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ColumnInfo, QueryResult, TableSort } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  result: QueryResult;
  columnsMeta?: ColumnInfo[] | null;
  sort?: TableSort | null;
  onSort?: (column: string) => void;
  offset?: number;
  hiddenColumns?: string[];
  draftRow?: Record<string, string> | null;
  onDraftChange?: (column: string, value: string) => void;
  onDraftCommit?: () => void;
  onDraftCancel?: () => void;
};

function metaFor(columnsMeta: ColumnInfo[] | null | undefined, name: string) {
  return columnsMeta?.find((c) => c.name === name);
}

function ResultGridInner({
  result,
  columnsMeta,
  sort,
  onSort,
  offset = 0,
  hiddenColumns = [],
  draftRow,
  onDraftChange,
  onDraftCommit,
  onDraftCancel,
}: Props) {
  const cols = result.columns
    .map((name, index) => ({ name, index }))
    .filter((c) => !hiddenColumns.includes(c.name));
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <Table className="border-separate border-spacing-0">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky top-0 z-10 w-10 border-b bg-muted/95 px-2 text-center font-mono text-[10px] text-muted-foreground">
              #
            </TableHead>
            {cols.map((c) => {
              const active = sort?.column === c.name;
              const meta = metaFor(columnsMeta, c.name);
              return (
                <TableHead
                  key={c.name}
                  className={cn(
                    "sticky top-0 z-10 border-b bg-muted/95 px-3 font-normal",
                    onSort && "cursor-pointer select-none hover:bg-muted",
                  )}
                  onClick={() => onSort?.(c.name)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-mono text-xs font-medium">{c.name}</span>
                    {meta?.dataType ? (
                      <span className="font-mono text-[10px] font-normal text-muted-foreground">
                        {meta.dataType}
                      </span>
                    ) : null}
                    {meta?.isPk ? (
                      <KeyRound className="size-3 text-amber-500" />
                    ) : null}
                    {onSort ? (
                      active ? (
                        sort?.desc ? (
                          <ArrowDown className="size-3 opacity-70" />
                        ) : (
                          <ArrowUp className="size-3 opacity-70" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-30" />
                      )
                    ) : null}
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.map((row, i) => (
            <TableRow key={i} className="hover:bg-muted/40">
              <TableCell className="w-10 border-b border-border/60 px-2 text-center font-mono text-[10px] text-muted-foreground">
                {offset + i + 1}
              </TableCell>
              {cols.map((c) => {
                const cell = row[c.index];
                return (
                <TableCell
                  key={`${i}-${c.name}`}
                  className="max-w-80 truncate border-b border-border/60 px-3 py-1.5 font-mono text-xs"
                >
                  {cell === null || cell === undefined ? (
                    <span className="italic text-muted-foreground">NULL</span>
                  ) : (
                    String(cell)
                  )}
                </TableCell>
                );
              })}
            </TableRow>
          ))}
          {draftRow ? (
            <TableRow className="bg-muted/30">
              <TableCell className="w-10 border-b border-border/60 px-2 text-center font-mono text-[10px] text-muted-foreground">
                +
              </TableCell>
              {cols.map((c) => (
                <TableCell
                  key={`draft-${c.name}`}
                  className="border-b border-border/60 p-0"
                >
                  <input
                    autoFocus={cols[0]?.name === c.name}
                    className="h-8 w-full bg-transparent px-3 font-mono text-xs outline-none"
                    value={draftRow[c.name] ?? ""}
                    placeholder="NULL"
                    onChange={(e) => onDraftChange?.(c.name, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onDraftCommit?.();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        onDraftCancel?.();
                      }
                    }}
                  />
                </TableCell>
              ))}
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

export const ResultGrid = memo(ResultGridInner);
