import { useState } from "react";
import type { Snippet } from "@/lib/snippets";
import type { Bookmark } from "@/lib/bookmarks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

type Props = {
  snippets: Snippet[];
  onInsert: (body: string) => void;
  onSave: (title: string, body: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  draftSql: string;
  bookmarks: Bookmark[];
  onSaveBookmark: (title: string) => void;
  onDeleteBookmark: (id: string) => void;
};

export function SnippetsPanel({
  snippets,
  onInsert,
  onSave,
  onDelete,
  onClose,
  draftSql,
  bookmarks,
  onSaveBookmark,
  onDeleteBookmark,
}: Props) {
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"snippets" | "bookmarks">("snippets");
  const isBm = mode === "bookmarks";
  const items: Snippet[] = isBm ? bookmarks : snippets;

  return (
    <aside className="flex w-56 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex h-8 items-center justify-between border-b border-border px-2">
        <div className="flex gap-2 text-[11px] font-medium">
          {(["snippets", "bookmarks"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={cn("capitalize", mode !== m && "text-muted-foreground")}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <ul className="flex flex-col gap-1">
          {items.map((s) => (
            <li key={s.id} className="group flex items-start gap-1">
              <button
                type="button"
                className="min-w-0 flex-1 rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
                onClick={() => onInsert(s.body)}
                title={s.body}
              >
                <div className="truncate font-medium">{s.title}</div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  {s.body.replace(/\s+/g, " ")}
                </div>
              </button>
              {!s.builtin ? (
                <button
                  type="button"
                  className="mt-1 hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                  onClick={() => (isBm ? onDeleteBookmark(s.id) : onDelete(s.id))}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-1.5 border-t border-border p-2">
        <Input
          className="h-7 text-xs"
          placeholder={isBm ? "Bookmark name" : "Snippet title"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full text-xs"
          disabled={!draftSql.trim()}
          onClick={() => {
            if (isBm) onSaveBookmark(title);
            else onSave(title, draftSql);
            setTitle("");
          }}
        >
          {isBm ? "Bookmark editor SQL" : "Save editor as snippet"}
        </Button>
      </div>
    </aside>
  );
}
