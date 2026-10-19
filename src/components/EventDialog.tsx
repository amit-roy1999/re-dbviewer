import { useState } from "react";
import { runSql } from "@/lib/dbApi";
import { isMysqlLike } from "@/lib/objectDdl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function eventSql(name: string, schedule: string, body: string) {
  const b = body.trim().replace(/;\s*$/, "");
  const wrapped = /;/.test(b) ? `BEGIN\n${b};\nEND` : b;
  return `CREATE EVENT \`${name.trim().split("`").join("``")}\`\nON SCHEDULE ${schedule.trim()}\nDO ${wrapped}`;
}

/** MySQL/MariaDB only: name + schedule + body -> CREATE EVENT. */
export function EventDialog({
  open,
  engine,
  connectionId,
  onClose,
  onCreated,
}: {
  open: boolean;
  engine: string;
  connectionId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("EVERY 1 DAY");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  const ok = name.trim() && schedule.trim() && body.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
        </DialogHeader>
        {!isMysqlLike(engine) ? (
          <p className="text-sm text-muted-foreground">
            Events are a MySQL / MariaDB feature; {engine} is not supported here.
          </p>
        ) : (
          <div className="grid gap-2 text-xs">
            <Input className="h-7 text-xs" placeholder="Event name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              className="h-7 font-mono text-xs"
              placeholder="EVERY 1 DAY  |  AT CURRENT_TIMESTAMP + INTERVAL 1 HOUR"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
            />
            <textarea
              className="h-28 rounded-md border border-input bg-transparent p-2 font-mono text-xs"
              placeholder="Body, e.g. DELETE FROM logs WHERE created_at < NOW() - INTERVAL 30 DAY"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {ok ? (
              <pre className="max-h-28 overflow-auto rounded border border-border bg-muted/30 p-2 font-mono text-[11px]">
                {eventSql(name, schedule, body)}
              </pre>
            ) : null}
            {msg ? <p className="text-destructive">{msg}</p> : null}
            <Button
              size="sm"
              className="w-fit"
              disabled={!ok}
              onClick={async () => {
                try {
                  await runSql(eventSql(name, schedule, body), connectionId);
                  setMsg("");
                  onCreated();
                  onClose();
                } catch (e) {
                  setMsg(String(e));
                }
              }}
            >
              Create event
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
