import { useRef, useState } from "react";
import { Loader2, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TableFilter } from "@/types";

export type SearchHit = {
  table: string;
  /** Text columns searched (also used as OR filters when opening the table). */
  columns: string[];
  rows: unknown[][];
  resultColumns: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Searches tables one by one, calling `onHit` per table with matches. */
  onSearch: (
    text: string,
    hooks: {
      onHit: (hit: SearchHit) => void;
      onProgress: (msg: string) => void;
      cancelled: () => boolean;
    },
  ) => Promise<void>;
  onOpenTable: (table: string, filters: TableFilter[]) => void;
};

export function GlobalSearchDialog({
  open,
  onClose,
  onSearch,
  onOpenTable,
}: Props) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [progress, setProgress] = useState("");
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  async function run() {
    if (!text.trim() || running) return;
    cancelRef.current = false;
    setHits([]);
    setRunning(true);
    try {
      await onSearch(text.trim(), {
        onHit: (h) => setHits((prev) => [...prev, h]),
        onProgress: setProgress,
        cancelled: () => cancelRef.current,
      });
    } finally {
      setRunning(false);
      setProgress((p) => (cancelRef.current ? "Stopped" : p === "" ? "" : "Done"));
    }
  }

  function stop() {
    cancelRef.current = true;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Search data</DialogTitle>
          <DialogDescription>
            LIKE search over the first text columns of up to 20 tables
            (5 rows per table). Slow on big databases.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            autoFocus
            className="h-8"
            placeholder="Text to find…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run();
            }}
          />
          {running ? (
            <Button size="sm" variant="outline" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button size="sm" disabled={!text.trim()} onClick={() => void run()}>
              Search
            </Button>
          )}
        </div>
        <div className="flex h-5 items-center gap-1.5 text-[11px] text-muted-foreground">
          {running ? <Loader2 className="size-3 animate-spin" /> : null}
          {progress}
          {!running && progress === "Done" && hits.length === 0
            ? " — no matches"
            : ""}
        </div>
        <div className="max-h-80 overflow-auto rounded-md border border-border">
          {hits.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No hits yet.</div>
          ) : (
            hits.map((h) => (
              <div key={h.table} className="border-b border-border last:border-0">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 bg-muted/40 px-3 py-1.5 text-left text-xs font-medium hover:bg-muted"
                  onClick={() => {
                    onClose();
                    onOpenTable(
                      h.table,
                      h.columns.map((c, i) => ({
                        column: c,
                        op: "like",
                        value: `%${text.trim()}%`,
                        join: i === 0 ? undefined : "or",
                      })),
                    );
                  }}
                >
                  <Table2 className="size-3.5 opacity-60" />
                  <span className="font-mono">{h.table}</span>
                  <span className="ml-auto text-muted-foreground">
                    {h.rows.length} hit{h.rows.length === 1 ? "" : "s"} · open
                  </span>
                </button>
                {h.rows.map((r, i) => (
                  <div
                    key={i}
                    className="truncate px-3 py-1 font-mono text-[11px] text-muted-foreground"
                    title={r.map((v) => String(v ?? "NULL")).join(" | ")}
                  >
                    {r
                      .map((v, j) => `${h.resultColumns[j]}=${v ?? "NULL"}`)
                      .join("  ")}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
