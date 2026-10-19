import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { exportTableSql } from "@/lib/dbApi";
import { isMysqlLike } from "@/lib/objectDdl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** E1: pick tables from a checklist and dump them into one .sql file via `export_table_sql`. */
export function DumpTablesDialog({
  open,
  engine,
  connectionId,
  connectionName,
  tables,
  onClose,
  onDone,
}: {
  open: boolean;
  engine: string;
  connectionId: string;
  connectionName: string;
  tables: string[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [withData, setWithData] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setPicked(new Set(tables));
      setFilter("");
      setErr("");
      setBusy("");
    }
    // snapshot of the table list at open time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = tables.filter((t) =>
    t.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const toggle = (t: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(t)) next.add(t);
      return next;
    });

  async function dump() {
    const list = tables.filter((t) => picked.has(t));
    const path = await save({
      defaultPath: `${connectionName.replace(/\s+/g, "-")}-tables.sql`,
      filters: [{ name: "SQL", extensions: ["sql"] }],
    });
    if (!path) return;
    setErr("");
    try {
      const mysql = isMysqlLike(engine);
      const parts = [
        `-- re-dbviewer dump of ${list.length} table(s) from ${connectionName} (${engine})${withData ? " with data" : " schema only"}\n`,
      ];
      if (mysql) parts.push("SET FOREIGN_KEY_CHECKS=0;\n");
      let failed = 0;
      for (let i = 0; i < list.length; i++) {
        setBusy(`Dumping ${list[i]} (${i + 1}/${list.length})…`);
        try {
          const d = await exportTableSql(list[i], true, withData, connectionId);
          parts.push(`-- Table ${list[i]}\n${d}\n`);
        } catch (e) {
          failed++;
          parts.push(`-- FAILED ${list[i]}: ${String(e).replace(/\n/g, " ")}\n`);
        }
      }
      if (mysql) parts.push("SET FOREIGN_KEY_CHECKS=1;\n");
      await invoke("write_text_file", { path, contents: parts.join("\n") });
      onDone(`Dumped ${list.length - failed}/${list.length} table(s) → ${path}`);
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dump selected tables</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            className="h-7 text-xs"
            placeholder="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <Button size="xs" variant="outline" onClick={() => setPicked(new Set(tables))}>
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
        {err ? <p className="text-xs text-destructive">{err}</p> : null}
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!!busy || picked.size === 0} onClick={() => void dump()}>
            Dump {picked.size} table(s)…
          </Button>
          {busy ? <span className="text-xs text-muted-foreground">{busy}</span> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
