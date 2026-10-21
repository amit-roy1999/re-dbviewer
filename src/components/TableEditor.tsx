import { useState } from "react";
import type {
  EditableColumn,
  EditableFk,
  EditableIndex,
} from "@/lib/tableDdl";
import {
  emptyColumn,
  emptyFk,
  emptyIndex,
  type TableAdvanced,
} from "@/lib/tableDdl";
import { cn } from "@/lib/utils";
import { typeSelectOptions } from "@/lib/columnTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

type Props = {
  mode: "create" | "alter";
  engine: string;
  tableName: string;
  onTableNameChange?: (name: string) => void;
  columns: EditableColumn[];
  onChange: (cols: EditableColumn[]) => void;
  indexes: EditableIndex[];
  onIndexesChange: (v: EditableIndex[]) => void;
  fks: EditableFk[];
  onFksChange: (v: EditableFk[]) => void;
  /** MySQL / MariaDB only: table options section (omit for other engines). */
  advanced?: TableAdvanced;
  onAdvancedChange?: (v: TableAdvanced) => void;
  ddlPreview: string;
  canApply: boolean;
  busy?: boolean;
  onApply: () => void;
  onOpenInQuery: () => void;
};

export function TableEditor({
  mode,
  engine,
  tableName,
  onTableNameChange,
  columns,
  onChange,
  indexes,
  onIndexesChange,
  fks,
  onFksChange,
  advanced,
  onAdvancedChange,
  ddlPreview,
  canApply,
  busy,
  onApply,
  onOpenInQuery,
}: Props) {
  const [showDdl, setShowDdl] = useState(true);
  const [section, setSection] = useState<"columns" | "indexes" | "fks" | "advanced">(
    "columns",
  );

  function update(i: number, patch: Partial<EditableColumn>) {
    onChange(columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {mode === "create" ? "New table" : "Edit table"}
        </span>
        {mode === "create" && onTableNameChange ? (
          <Input
            className="h-7 w-48 font-mono text-xs"
            value={tableName}
            onChange={(e) => onTableNameChange(e.target.value)}
            placeholder="table_name"
          />
        ) : (
          <span className="font-mono text-xs font-medium">{tableName}</span>
        )}
        <div className="ml-auto flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onOpenInQuery}
          >
            Open SQL in Query
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={busy || !canApply}
            onClick={onApply}
          >
            Apply
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 border-b border-border px-3">
        {(
          [
            ["columns", `Columns (${columns.length})`],
            ["indexes", `Indexes (${indexes.length})`],
            ["fks", `Foreign keys (${fks.length})`],
            ...(onAdvancedChange ? ([["advanced", "Advanced"]] as const) : []),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "h-8 text-xs",
              section === id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "advanced" && advanced && onAdvancedChange ? (
        <div className="grid max-w-xl gap-2 p-3 text-xs">
          <label className="grid gap-1">
            <span className="text-muted-foreground">ENGINE</span>
            <Input
              className="h-7 font-mono text-xs"
              placeholder="InnoDB (empty = server default)"
              value={advanced.engine}
              onChange={(e) => onAdvancedChange({ ...advanced, engine: e.target.value })}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">DEFAULT CHARSET</span>
            <Input
              className="h-7 font-mono text-xs"
              placeholder="utf8mb4 (empty = server default)"
              value={advanced.charset}
              onChange={(e) => onAdvancedChange({ ...advanced, charset: e.target.value })}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">PARTITION BY (optional, shown as a hint comment)</span>
            <textarea
              className="h-20 rounded-md border border-input bg-transparent p-2 font-mono text-xs"
              placeholder="PARTITION BY HASH(id) PARTITIONS 4"
              value={advanced.partition}
              onChange={(e) => onAdvancedChange({ ...advanced, partition: e.target.value })}
            />
          </label>
        </div>
      ) : null}

      {section === "indexes" ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-2 font-medium">Name</th>
                <th className="pb-1 pr-2 font-medium">Columns (comma list)</th>
                <th className="pb-1 pr-2 font-medium">Unique</th>
                <th className="pb-1" />
              </tr>
            </thead>
            <tbody>
              {indexes.map((ix, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="py-1 pr-2">
                    <Input
                      className="h-7 font-mono text-xs"
                      value={ix.name}
                      disabled={ix.locked}
                      placeholder="(auto)"
                      onChange={(e) =>
                        onIndexesChange(
                          indexes.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <Input
                      className="h-7 font-mono text-xs"
                      value={ix.columns}
                      disabled={ix.locked}
                      onChange={(e) =>
                        onIndexesChange(
                          indexes.map((x, j) =>
                            j === i ? { ...x, columns: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="checkbox"
                      checked={ix.unique}
                      disabled={ix.locked}
                      onChange={(e) =>
                        onIndexesChange(
                          indexes.map((x, j) =>
                            j === i ? { ...x, unique: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-1">
                    {ix.locked ? (
                      <span className="text-[10px] text-muted-foreground">
                        system
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          onIndexesChange(indexes.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-7 text-xs"
            onClick={() => onIndexesChange([...indexes, emptyIndex()])}
          >
            <Plus className="size-3.5" />
            Add index
          </Button>
        </div>
      ) : null}

      {section === "fks" ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 pr-2 font-medium">Name</th>
                <th className="pb-1 pr-2 font-medium">Columns</th>
                <th className="pb-1 pr-2 font-medium">Ref table</th>
                <th className="pb-1 pr-2 font-medium">Ref columns</th>
                <th className="pb-1" />
              </tr>
            </thead>
            <tbody>
              {fks.map((fk, i) => {
                const upd = (patch: Partial<EditableFk>) =>
                  onFksChange(
                    fks.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                  );
                return (
                  <tr key={i} className="border-t border-border/60">
                    <td className="py-1 pr-2">
                      <Input
                        className="h-7 font-mono text-xs"
                        value={fk.name}
                        placeholder="(auto)"
                        onChange={(e) => upd({ name: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        className="h-7 font-mono text-xs"
                        value={fk.columns}
                        onChange={(e) => upd({ columns: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        className="h-7 font-mono text-xs"
                        value={fk.refTable}
                        onChange={(e) => upd({ refTable: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        className="h-7 font-mono text-xs"
                        value={fk.refColumns}
                        onChange={(e) => upd({ refColumns: e.target.value })}
                      />
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        onClick={() => onFksChange(fks.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-7 text-xs"
            onClick={() => onFksChange([...fks, emptyFk()])}
          >
            <Plus className="size-3.5" />
            Add foreign key
          </Button>
        </div>
      ) : null}

      {section === "columns" ? (
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 pr-2 font-medium">Name</th>
              <th className="pb-1 pr-2 font-medium">Type</th>
              <th className="pb-1 pr-2 font-medium">Null</th>
              <th className="pb-1 pr-2 font-medium">Default</th>
              <th className="pb-1 pr-2 font-medium">PK</th>
              <th className="pb-1" />
            </tr>
          </thead>
          <tbody>
            {columns.map((c, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="py-1 pr-2">
                  <Input
                    className="h-7 font-mono text-xs"
                    value={c.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <select
                    className="h-7 w-full min-w-[8rem] cursor-pointer appearance-none rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 dark:bg-input/30 dark:[color-scheme:dark]"
                    value={c.dataType}
                    onChange={(e) => update(i, { dataType: e.target.value })}
                  >
                    {typeSelectOptions(engine, c.dataType).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="checkbox"
                    checked={c.nullable}
                    onChange={(e) => update(i, { nullable: e.target.checked })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    className="h-7 font-mono text-xs"
                    value={c.defaultValue}
                    onChange={(e) =>
                      update(i, { defaultValue: e.target.value })
                    }
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="checkbox"
                    checked={c.isPk}
                    onChange={(e) => update(i, { isPk: e.target.checked })}
                  />
                </td>
                <td className="py-1">
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                    onClick={() => onChange(columns.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 h-7 text-xs"
          onClick={() => onChange([...columns, emptyColumn()])}
        >
          <Plus className="size-3.5" />
          Add column
        </Button>
      </div>
      ) : null}

      <div className="border-t border-border">
        <button
          type="button"
          className="flex h-7 w-full items-center px-3 text-[11px] text-muted-foreground hover:bg-muted/40"
          onClick={() => setShowDdl((v) => !v)}
        >
          DDL preview {showDdl ? "▾" : "▸"}
        </button>
        {showDdl ? (
          <pre className="max-h-36 overflow-auto border-t border-border bg-muted/30 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">
            {ddlPreview || "-- empty"}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
