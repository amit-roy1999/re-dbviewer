import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null;
  options: string[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyLabel?: string;
  "data-testid"?: string;
};

/** Compact searchable picker for `table.column` result fields. */
export function SearchableColumnSelect({
  value,
  options,
  onChange,
  placeholder = "Search table.column…",
  emptyLabel = "—",
  "data-testid": testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.toLowerCase().includes(q) ||
        o.split(".").pop()?.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  return (
    <div ref={rootRef} className="relative" data-testid={testId}>
      <button
        type="button"
        className={cn(
          "flex h-8 w-full items-center gap-1 rounded-md border border-input bg-transparent px-2 text-left font-mono text-[11px] hover:bg-muted/40",
          !value && "text-muted-foreground",
        )}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="min-w-0 flex-1 truncate">{value || emptyLabel}</span>
        <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full min-w-[14rem] rounded-md border border-border bg-popover p-1 shadow-md">
          <div className="relative mb-1">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              className="h-7 pl-7 font-mono text-[11px]"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered[0]) {
                  onChange(filtered[0]);
                  setOpen(false);
                }
              }}
            />
          </div>
          <ul className="max-h-48 overflow-y-auto overscroll-contain">
            <li>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left font-mono text-[11px] text-muted-foreground hover:bg-muted",
                  !value && "bg-muted",
                )}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                {!value ? (
                  <Check className="size-3 shrink-0 text-primary" />
                ) : (
                  <span className="size-3 shrink-0" />
                )}
                {emptyLabel}
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-1.5 py-2 text-[11px] text-muted-foreground">
                No columns match
              </li>
            ) : (
              filtered.map((opt) => {
                const on = value === opt;
                const dot = opt.indexOf(".");
                return (
                  <li key={opt}>
                    <button
                      type="button"
                      title={opt}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left font-mono text-[11px] hover:bg-muted",
                        on && "bg-muted",
                      )}
                      onClick={() => {
                        onChange(opt);
                        setOpen(false);
                      }}
                    >
                      {on ? (
                        <Check className="size-3 shrink-0 text-primary" />
                      ) : (
                        <span className="size-3 shrink-0" />
                      )}
                      <span className="min-w-0 truncate">
                        {dot > 0 ? (
                          <>
                            <span className="text-muted-foreground">
                              {opt.slice(0, dot + 1)}
                            </span>
                            {opt.slice(dot + 1)}
                          </>
                        ) : (
                          opt
                        )}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
