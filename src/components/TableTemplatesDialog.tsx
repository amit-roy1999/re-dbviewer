import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { EditableColumn } from "@/lib/tableDdl";
import {
  listTemplates,
  parseColumnDefs,
  saveTemplates,
  type TableTemplate,
} from "@/lib/tableTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SAMPLE = `[
  {"name": "id", "dataType": "INTEGER", "nullable": false, "isPk": true},
  {"name": "created_at", "dataType": "TIMESTAMP", "defaultValue": "CURRENT_TIMESTAMP"}
]`;

/** Name + column-defs JSON templates (localStorage); pick one to open a New table tab. */
export function TableTemplatesDialog({
  open,
  onClose,
  onUse,
}: {
  open: boolean;
  onClose: () => void;
  onUse: (columns: EditableColumn[]) => void;
}) {
  const [list, setList] = useState<TableTemplate[]>(listTemplates);
  const [name, setName] = useState("");
  const [defs, setDefs] = useState(SAMPLE);
  const [err, setErr] = useState("");

  const update = (next: TableTemplate[]) => {
    saveTemplates(next);
    setList(next);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New table from template</DialogTitle>
        </DialogHeader>
        <ul className="max-h-40 overflow-auto text-xs">
          {list.length === 0 ? (
            <li className="text-muted-foreground">No templates yet. Add one below.</li>
          ) : null}
          {list.map((t) => (
            <li key={t.name} className="flex items-center gap-2 py-0.5">
              <button
                type="button"
                className="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left hover:bg-muted"
                onClick={() => {
                  onUse(t.columns.map((c) => ({ ...c })));
                  onClose();
                }}
              >
                {t.name}{" "}
                <span className="text-muted-foreground">
                  ({t.columns.map((c) => c.name).join(", ")})
                </span>
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => update(list.filter((x) => x.name !== t.name))}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="grid gap-1.5 border-t border-border pt-3">
          <Input
            className="h-7 text-xs"
            placeholder="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="h-32 rounded-md border border-input bg-transparent p-2 font-mono text-xs"
            value={defs}
            onChange={(e) => setDefs(e.target.value)}
          />
          {err ? <p className="text-xs text-destructive">{err}</p> : null}
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => {
              try {
                if (!name.trim()) throw new Error("Template name is required.");
                const columns = parseColumnDefs(defs);
                update([...list.filter((t) => t.name !== name.trim()), { name: name.trim(), columns }]);
                setName("");
                setErr("");
              } catch (e) {
                setErr(String(e instanceof Error ? e.message : e));
              }
            }}
          >
            Save template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
