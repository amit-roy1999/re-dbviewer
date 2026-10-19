import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RoutineKind } from "@/lib/objectDdl";

const taClass =
  "min-h-0 flex-1 resize-none rounded-md border border-input bg-background p-2 font-mono text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Preview({ ddl }: { ddl: string }) {
  return (
    <div className="border-t border-border">
      <div className="flex h-7 items-center px-3 text-[11px] text-muted-foreground">
        DDL preview
      </div>
      <pre className="max-h-36 overflow-auto border-t border-border bg-muted/30 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">
        {ddl || "-- empty"}
      </pre>
    </div>
  );
}

export function ViewEditor({
  mode,
  name,
  body,
  ddl,
  busy,
  onName,
  onBody,
  onApply,
  onOpenInQuery,
}: {
  mode: "create" | "alter";
  name: string;
  body: string;
  ddl: string;
  busy: boolean;
  onName: (v: string) => void;
  onBody: (v: string) => void;
  onApply: () => void;
  onOpenInQuery: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {mode === "create" ? "New view" : "Edit view"}
        </span>
        {mode === "create" ? (
          <Input
            className="h-7 w-48 font-mono text-xs"
            placeholder="view_name"
            value={name}
            onChange={(e) => onName(e.target.value)}
          />
        ) : (
          <span className="font-mono text-xs font-medium">{name}</span>
        )}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onOpenInQuery}>
            Open SQL in Query
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={busy || !name.trim() || !body.trim()}
            onClick={onApply}
          >
            {mode === "create" ? "Create view" : "Apply (replace)"}
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-3">
        <span className="text-[11px] text-muted-foreground">
          SELECT body (after <span className="font-mono">AS</span>)
        </span>
        <textarea
          className={taClass}
          spellCheck={false}
          value={body}
          onChange={(e) => onBody(e.target.value)}
          placeholder="SELECT …"
        />
      </div>
      <Preview ddl={ddl} />
    </div>
  );
}

export function RoutineEditor({
  mode,
  supported,
  unsupportedTip,
  name,
  kind,
  body,
  ddl,
  busy,
  onName,
  onKind,
  onBody,
  onApply,
  onOpenInQuery,
}: {
  mode: "create" | "alter";
  supported: boolean;
  unsupportedTip: string;
  name: string;
  kind: RoutineKind;
  body: string;
  ddl: string;
  busy: boolean;
  onName: (v: string) => void;
  onKind: (k: RoutineKind) => void;
  onBody: (v: string) => void;
  onApply: () => void;
  onOpenInQuery: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {mode === "create" ? "New routine" : "Edit routine"}
        </span>
        {mode === "create" ? (
          <>
            <Input
              className="h-7 w-48 font-mono text-xs"
              placeholder="routine_name"
              value={name}
              onChange={(e) => onName(e.target.value)}
            />
            <select
              className="h-7 rounded-md border border-input bg-background px-2 text-xs dark:[color-scheme:dark]"
              value={kind}
              onChange={(e) => onKind(e.target.value as RoutineKind)}
            >
              <option value="procedure">Procedure</option>
              <option value="function">Function</option>
            </select>
          </>
        ) : (
          <span className="font-mono text-xs font-medium">
            {name} ({kind})
          </span>
        )}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onOpenInQuery}>
            Open SQL in Query
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={busy || !supported || !name.trim() || !body.trim()}
            onClick={onApply}
          >
            {mode === "create" ? "Create" : "Apply (drop + create)"}
          </Button>
        </div>
      </div>
      {!supported ? (
        <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {unsupportedTip}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-3">
        <span className="text-[11px] text-muted-foreground">
          Everything after the name: parameters, characteristics and body
        </span>
        <textarea
          className={taClass}
          spellCheck={false}
          value={body}
          onChange={(e) => onBody(e.target.value)}
        />
      </div>
      <Preview ddl={ddl} />
    </div>
  );
}
