import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  buildAppCommands,
  filterCommands,
  type CommandContext,
} from "@/lib/appCommands";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  ctx: CommandContext;
};

export function CommandPalette({ open, onClose, ctx }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const catalog = useMemo(() => buildAppCommands(), []);
  const results = useMemo(
    () => filterCommands(query, ctx, catalog),
    [query, ctx, catalog],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function runAt(index: number) {
    const cmd = results[index];
    if (!cmd) return;
    onClose();
    // Defer so the dialog unmounts before side effects open other dialogs.
    queueMicrotask(() => cmd.run(ctx));
  }

  const groups = useMemo(() => {
    const map = new Map<string, typeof results>();
    for (const c of results) {
      const list = map.get(c.group) ?? [];
      list.push(c);
      map.set(c.group, list);
    }
    return [...map.entries()];
  }, [results]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-testid="command-palette"
        className="gap-2 p-3 sm:max-w-lg"
        showCloseButton={false}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) =>
              results.length ? Math.min(results.length - 1, i + 1) : 0,
            );
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            runAt(active);
          }
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
        </DialogHeader>
        <Input
          ref={inputRef}
          data-testid="command-palette-input"
          className="h-9"
          placeholder="Search features, menus, settings…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        <p className="text-[10px] text-muted-foreground">
          Features, settings, and open-connection table names — not row data
          (use Search Data for that).
        </p>
        <div className="max-h-72 min-h-0 overflow-auto rounded-md border border-border">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No matches
            </div>
          ) : (
            groups.map(([group, items]) => (
              <div key={group}>
                <div className="sticky top-0 bg-muted/80 px-2 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {group}
                </div>
                <ul>
                  {items.map((c) => {
                    const idx = results.findIndex((r) => r.id === c.id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          data-testid={`command-item-${c.id}`}
                          className={cn(
                            "flex w-full px-3 py-1.5 text-left text-xs hover:bg-muted",
                            idx === active && "bg-muted",
                          )}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => runAt(idx)}
                        >
                          {c.title}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>Enter run</span>
          <span>Esc close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
