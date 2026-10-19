import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { helpForWord, searchHelp, type HelpEntry } from "@/lib/sqlHelp";

type Props = {
  /** Word under the editor cursor. */
  word: string;
  onInsert: (text: string) => void;
  onClose: () => void;
};

export function ContextHelpPanel({ word, onInsert, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<HelpEntry | null>(null);

  // Follow the cursor: a new word under the cursor clears manual picks.
  useEffect(() => {
    setPicked(null);
    setQuery("");
  }, [word]);

  const auto = helpForWord(word);
  const entry = picked ?? (query ? null : auto);
  const list = searchHelp(query);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex h-8 items-center justify-between border-b border-border px-2">
        <span className="text-[11px] font-medium">Context help</span>
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="border-b border-border p-2">
        <Input
          className="h-7 text-xs"
          placeholder="Search keywords"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
          }}
        />
        <div className="mt-1 text-[10px] text-muted-foreground">
          Cursor word: <span className="font-mono">{word || "—"}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2 text-xs">
        {entry ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold">{entry.title}</div>
            <pre className="rounded bg-muted/50 p-2 font-mono text-[11px] whitespace-pre-wrap">
              {entry.syntax}
            </pre>
            <p className="text-muted-foreground">{entry.text}</p>
            {entry.example ? (
              <>
                <pre className="rounded bg-muted/50 p-2 font-mono text-[11px] whitespace-pre-wrap">
                  {entry.example}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => onInsert(entry.example ?? "")}
                >
                  Insert example
                </Button>
              </>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground">
            {query ? "Pick a topic below." : "No help for this word — pick a topic."}
          </p>
        )}
        <div className="mt-3 border-t border-border pt-2">
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Topics
          </div>
          <ul className="flex flex-col">
            {list.map((h) => (
              <li key={h.keyword}>
                <button
                  type="button"
                  className="w-full rounded px-1.5 py-1 text-left font-mono text-[11px] hover:bg-muted"
                  onClick={() => setPicked(h)}
                >
                  {h.keyword}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
