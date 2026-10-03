import { memo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { QueryResult } from "@/types";

function ResultGridInner({ result }: { result: QueryResult }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
      <Table>
        <TableHeader>
          <TableRow>
            {result.columns.map((c) => (
              <TableHead key={c} className="sticky top-0 z-10 bg-muted/90 font-mono text-xs">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell
                  key={`${i}-${result.columns[j] ?? j}`}
                  className="max-w-80 truncate font-mono text-xs"
                >
                  {cell === null ? (
                    <span className="text-muted-foreground">NULL</span>
                  ) : (
                    String(cell)
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">
        {result.rowsAffected != null
          ? `${result.rowsAffected} rows affected`
          : `${result.rows.length} rows`}
      </p>
    </div>
  );
}

export const ResultGrid = memo(ResultGridInner);
