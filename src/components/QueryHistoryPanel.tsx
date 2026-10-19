import { useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "@/lib/queryHistory";
import { cn } from "@/lib/utils";

const BUCKETS = [
  { label: "<10ms", max: 10 },
  { label: "<50ms", max: 50 },
  { label: "<200ms", max: 200 },
  { label: "<1s", max: 1000 },
  { label: "≥1s", max: Infinity },
];

/** Tiny CSS bar histogram of query durations. */
function TimingHistogram({ entries }: { entries: HistoryEntry[] }) {
  const counts = BUCKETS.map(() => 0);
  for (const e of entries) {
    counts[BUCKETS.findIndex((b) => e.durationMs < b.max)]++;
  }
  const top = Math.max(1, ...counts);
  return (
    <span
      className="flex h-4 items-end gap-0.5"
      title={BUCKETS.map((b, i) => `${b.label}: ${counts[i]}`).join("  ")}
    >
      {counts.map((n, i) => (
        <span
          key={i}
          className="w-2 rounded-sm bg-primary/60"
          style={{ height: `${Math.max(2, (n / top) * 16)}px` }}
        />
      ))}
    </span>
  );
}

type Props = {
  entries: HistoryEntry[];
  open: boolean;
  onToggle: () => void;
  onReuse: (sql: string) => void;
  /** Plain-text session log (one line per Run / Explain outcome). */
  textLog?: string[];
  onClearText?: () => void;
};

export function QueryHistoryPanel({
  entries,
  open,
  onToggle,
  onReuse,
  textLog = [],
  onClearText,
}: Props) {
  const [mode, setMode] = useState<"history" | "text">("history");
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [textLog, mode, open]);
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col border-t border-border bg-card",
        open ? "h-40" : "h-7",
      )}
    >
      <button
        type="button"
        className="flex h-7 shrink-0 items-center justify-between px-3 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        onClick={onToggle}
      >
        <span className="flex items-center gap-3">
          Output / History ({entries.length})
          {entries.length > 0 ? <TimingHistogram entries={entries} /> : null}
        </span>
        <span className="font-mono text-[10px]">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 px-2 pb-1 text-[11px]">
            {(["history", "text"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={cn(
                  "rounded px-2 py-0.5",
                  mode === m
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setMode(m)}
              >
                {m === "history" ? "History" : "Text"}
              </button>
            ))}
            {mode === "text" && textLog.length > 0 ? (
              <button
                type="button"
                className="ml-auto rounded px-2 py-0.5 text-muted-foreground hover:text-foreground"
                onClick={onClearText}
              >
                Clear
              </button>
            ) : null}
          </div>
          {mode === "text" ? (
            <pre
              ref={logRef}
              className="min-h-0 flex-1 overflow-auto px-3 pb-2 font-mono text-[11px] whitespace-pre-wrap text-foreground"
            >
              {textLog.length
                ? textLog.join("\n")
                : "Run or Explain a query to append output here."}
            </pre>
          ) : (
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {entries.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-muted-foreground">
              Run or Explain a query to see history here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="w-full rounded px-1.5 py-1 text-left hover:bg-muted/60"
                    onClick={() => onReuse(e.sql)}
                    title="Insert into editor"
                  >
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span
                        className={cn(
                          "font-mono",
                          e.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
                        )}
                      >
                        {e.ok ? "OK" : "ERR"}
                      </span>
                      <span>{e.durationMs}ms</span>
                      <span>{new Date(e.at).toLocaleTimeString()}</span>
                      <span className="truncate">{e.message}</span>
                    </div>
                    <div className="truncate font-mono text-[11px] text-foreground">
                      {e.sql.replace(/\s+/g, " ")}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
