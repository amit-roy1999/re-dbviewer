import { useState } from "react";
import { quoteIdent, runSql } from "@/lib/dbApi";
import { isMysqlLike } from "@/lib/objectDdl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const sel =
  "h-7 rounded-md border border-input bg-background px-2 text-xs dark:[color-scheme:dark]";

export function triggerSql(
  engine: string,
  p: {
    name: string;
    timing: string;
    event: string;
    table: string;
    body: string;
  },
) {
  const b = p.body.trim().replace(/;\s*$/, "");
  const wrapped = /^begin\b/i.test(b) || !/;/.test(b) ? b : `BEGIN\n${b};\nEND`;
  return `CREATE TRIGGER ${quoteIdent(engine, p.name.trim())}\n${p.timing} ${p.event} ON ${quoteIdent(engine, p.table)}\nFOR EACH ROW ${wrapped}`;
}

/** MySQL/MariaDB only: name, timing, event, table, body -> CREATE TRIGGER. */
export function TriggerDialog({
  open,
  engine,
  connectionId,
  tables,
  defaultTable,
  onClose,
  onCreated,
}: {
  open: boolean;
  engine: string;
  connectionId: string;
  tables: string[];
  defaultTable?: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [timing, setTiming] = useState("BEFORE");
  const [event, setEvent] = useState("INSERT");
  const [table, setTable] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  const tbl = table || defaultTable || tables[0] || "";
  const ok = name.trim() && tbl && body.trim();
  const draft = { name, timing, event, table: tbl, body };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New trigger</DialogTitle>
        </DialogHeader>
        {!isMysqlLike(engine) ? (
          <p className="text-sm text-muted-foreground">
            The trigger dialog supports MySQL / MariaDB only. For {engine}, write
            CREATE TRIGGER in a Query tab.
          </p>
        ) : (
          <div className="grid gap-2 text-xs">
            <Input
              className="h-7 text-xs"
              placeholder="Trigger name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <select className={sel} value={timing} onChange={(e) => setTiming(e.target.value)}>
                <option>BEFORE</option>
                <option>AFTER</option>
              </select>
              <select className={sel} value={event} onChange={(e) => setEvent(e.target.value)}>
                <option>INSERT</option>
                <option>UPDATE</option>
                <option>DELETE</option>
              </select>
              <span className="text-muted-foreground">ON</span>
              <select
                className={`${sel} min-w-0 flex-1 font-mono`}
                value={tbl}
                onChange={(e) => setTable(e.target.value)}
              >
                {tables.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <textarea
              className="h-28 rounded-md border border-input bg-transparent p-2 font-mono text-xs"
              placeholder="Body, e.g. SET NEW.updated_at = NOW();"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {ok ? (
              <pre className="max-h-28 overflow-auto rounded border border-border bg-muted/30 p-2 font-mono text-[11px]">
                {triggerSql(engine, draft)}
              </pre>
            ) : null}
            {msg ? <p className="text-destructive">{msg}</p> : null}
            <Button
              size="sm"
              className="w-fit"
              disabled={!ok}
              onClick={async () => {
                try {
                  await runSql(triggerSql(engine, draft), connectionId);
                  setMsg("");
                  onCreated();
                  onClose();
                } catch (e) {
                  setMsg(String(e));
                }
              }}
            >
              Create trigger
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
