import { useMemo } from "react";
import type { QueryResult } from "@/types";

type Props = {
  result: QueryResult;
  hiddenColumns?: string[];
};

function rowsToJson(
  result: QueryResult,
  hiddenColumns: string[],
): unknown[] {
  const hide = new Set(hiddenColumns);
  const cols = result.columns
    .map((name, index) => ({ name, index }))
    .filter((c) => !hide.has(c.name));
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (const c of cols) {
      obj[c.name] = row[c.index] ?? null;
    }
    return obj;
  });
}

export function JsonResultView({ result, hiddenColumns = [] }: Props) {
  const text = useMemo(
    () => JSON.stringify(rowsToJson(result, hiddenColumns), null, 2),
    [result, hiddenColumns],
  );

  if (result.rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        No rows to show as JSON.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-card/40 px-3 py-2">
      <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-foreground">
        {text}
      </pre>
    </div>
  );
}
