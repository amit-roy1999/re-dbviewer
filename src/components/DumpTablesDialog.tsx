import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openFileDialog, save } from "@tauri-apps/plugin-dialog";
import { exportTableSql, runSql } from "@/lib/dbApi";
import { isMysqlLike } from "@/lib/objectDdl";
import { splitStatements } from "@/lib/sqlStatement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Mode = "dump" | "restore";

/** Dump/restore wizard: table checklist + progress bar; restore runs statements with progress. */
export function DumpTablesDialog({
  open,
  engine,
  connectionId,
  connectionName,
  tables,
  initialMode = "dump",
  onClose,
  onDone,
}: {
  open: boolean;
  engine: string;
  connectionId: string;
  connectionName: string;
  tables: string[];
  initialMode?: Mode;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [withData, setWithData] = useState(true);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setPicked(new Set(tables));
      setFilter("");
      setErr("");
      setBusy("");
      setProgress(null);
      setMode(initialMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode]);

  const shown = tables.filter((t) =>
    t.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const toggle = (t: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(t)) next.add(t);
      return next;
    });

  const pct =
    progress && progress.total > 0
      ? Math.round((100 * progress.done) / progress.total)
      : 0;

  async function dump() {
    const list = tables.filter((t) => picked.has(t));
    const path = await save({
      defaultPath: `${connectionName.replace(/\s+/g, "-")}-tables.sql`,
      filters: [{ name: "SQL", extensions: ["sql"] }],
    });
    if (!path) return;
    setErr("");
    setProgress({ done: 0, total: list.length });
    try {
      const mysql = isMysqlLike(engine);
      const parts = [
        `-- re-dbviewer dump of ${list.length} table(s) from ${connectionName} (${engine})${withData ? " with data" : " schema only"}\n`,
      ];
      if (mysql) parts.push("SET FOREIGN_KEY_CHECKS=0;\n");
      let failed = 0;
      for (let i = 0; i < list.length; i++) {
        setBusy(`Dumping ${list[i]} (${i + 1}/${list.length})…`);
        setProgress({ done: i, total: list.length });
        try {
          const d = await exportTableSql(list[i], true, withData, connectionId);
          parts.push(`-- Table ${list[i]}\n${d}\n`);
        } catch (e) {
          failed++;
          parts.push(`-- FAILED ${list[i]}: ${String(e).replace(/\n/g, " ")}\n`);
        }
      }
      if (mysql) parts.push("SET FOREIGN_KEY_CHECKS=1;\n");
      setProgress({ done: list.length, total: list.length });
      await invoke("write_text_file", { path, contents: parts.join("\n") });
      onDone(`Dumped ${list.length - failed}/${list.length} table(s) → ${path}`);
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy("");
      setProgress(null);
    }
  }

  async function restore() {
    const path = await openFileDialog({
      multiple: false,
      filters: [{ name: "SQL", extensions: ["sql"] }],
    });
    if (typeof path !== "string") return;
    setErr("");
    try {
      const sqlFile = await invoke<string>("read_text_file", { path });
      const stmts = splitStatements(sqlFile).filter((s) => s.trim());
      if (!stmts.length) {
        setErr("No statements in file");
        return;
      }
      setProgress({ done: 0, total: stmts.length });
      let failed = 0;
      for (let i = 0; i < stmts.length; i++) {
        setBusy(`Restoring statement ${i + 1}/${stmts.length}…`);
        setProgress({ done: i, total: stmts.length });
        try {
          await runSql(stmts[i], connectionId);
        } catch (e) {
          failed++;
          setErr(`Stopped at statement ${i + 1}: ${String(e)}`);
          break;
        }
      }
      setProgress({ done: stmts.length - failed, total: stmts.length });
      if (!failed) {
        onDone(`Restored ${stmts.length} statement(s) from ${path}`);
        onClose();
      } else {
        onDone(
          `Restore partial: ${stmts.length - failed}/${stmts.length} statement(s) from ${path}`,
        );
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy("");
      setProgress(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        data-testid="dump-restore-wizard"
        className="flex max-h-[80vh] flex-col sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Dump / Restore</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1">
          <Button
            size="xs"
            variant={mode === "dump" ? "default" : "outline"}
            data-testid="dump-restore-tab-dump"
            onClick={() => setMode("dump")}
            disabled={!!busy}
          >
            Dump
          </Button>
          <Button
            size="xs"
            variant={mode === "restore" ? "default" : "outline"}
            data-testid="dump-restore-tab-restore"
            onClick={() => setMode("restore")}
            disabled={!!busy}
          >
            Restore
          </Button>
        </div>
        {mode === "dump" ? (
          <>
            <div className="flex items-center gap-2">
              <Input
                className="h-7 text-xs"
                placeholder="Filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <Button
                size="xs"
                variant="outline"
                onClick={() => setPicked(new Set(tables))}
              >
                All
              </Button>
              <Button size="xs" variant="outline" onClick={() => setPicked(new Set())}>
                None
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border p-1">
              {shown.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">No tables.</p>
              ) : (
                shown.map((t) => (
                  <label
                    key={t}
                    className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      className="size-3.5 accent-primary"
                      checked={picked.has(t)}
                      onChange={() => toggle(t)}
                    />
                    <span className="truncate font-mono">{t}</span>
                  </label>
                ))
              )}
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={withData}
                onChange={(e) => setWithData(e.target.checked)}
              />
              Include data (otherwise schema only)
            </label>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Choose a `.sql` dump file. Statements run one-by-one with a progress
            bar; the first error stops the restore.
          </p>
        )}
        {progress ? (
          <div data-testid="dump-restore-progress" className="grid gap-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {busy || `${progress.done}/${progress.total} (${pct}%)`}
            </span>
          </div>
        ) : busy ? (
          <span className="text-xs text-muted-foreground">{busy}</span>
        ) : null}
        {err ? <p className="text-xs text-destructive">{err}</p> : null}
        <div className="flex items-center gap-2">
          {mode === "dump" ? (
            <Button
              size="sm"
              data-testid="dump-restore-run"
              disabled={!!busy || picked.size === 0}
              onClick={() => void dump()}
            >
              Dump {picked.size} table(s)…
            </Button>
          ) : (
            <Button
              size="sm"
              data-testid="dump-restore-run"
              disabled={!!busy}
              onClick={() => void restore()}
            >
              Choose SQL file…
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
