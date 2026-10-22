import { memo, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, KeyRound, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ColumnInfo, QueryResult, TableSort } from "@/types";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/clipboard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  resultToInserts,
  resultToJson,
  resultToMarkdown,
} from "@/lib/resultExport";
import {
  bytesToHexDump,
  bytesToImageDataUrl,
  classifyCellPreview,
} from "@/lib/cellPreview";
import { classifyGeo } from "@/lib/geoPreview";

type Props = {
  result: QueryResult;
  columnsMeta?: ColumnInfo[] | null;
  sort?: TableSort | null;
  onSort?: (column: string) => void;
  offset?: number;
  hiddenColumns?: string[];
  draftRow?: Record<string, string> | null;
  onDraftChange?: (column: string, value: string) => void;
  onDraftCommit?: () => void;
  onDraftCancel?: () => void;
  onCellEdit?: (rowIndex: number, column: string, value: string) => void;
  /** Queued (not yet applied) value for a cell; shown highlighted. */
  cellOverride?: (rowIndex: number, column: string) => string | undefined;
  onRowDelete?: (rowIndex: number) => void;
  onDeleteSelected?: (rowIndexes: number[]) => void;
  selectedRowIndexes?: number[];
  onSelectionChange?: (rowIndexes: number[]) => void;
  /** Table + engine used for "Copy as INSERTs". */
  exportContext?: { table: string; engine: string };
};

type CellEditState = {
  rowIndex: number;
  columnName: string;
  value: string;
};

type ContextMenuState =
  | {
      kind: "cell";
      x: number;
      y: number;
      rowIndex: number;
      columnName: string;
      value: string;
      row: unknown[];
    }
  | {
      kind: "row";
      x: number;
      y: number;
      rowIndex: number;
      row: unknown[];
    }
  | {
      kind: "column";
      x: number;
      y: number;
      columnName: string;
      values: unknown[];
    };

function metaFor(columnsMeta: ColumnInfo[] | null | undefined, name: string) {
  return columnsMeta?.find((c) => c.name === name);
}

function cellToText(value: unknown) {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** Pretty-printed JSON when the cell is a JSON object/array (string or already parsed), else null. */
function prettyJson(value: unknown): string | null {
  try {
    if (value && typeof value === "object") return JSON.stringify(value, null, 2);
    if (typeof value !== "string") return null;
    const t = value.trim();
    if (!/^[[{]/.test(t)) return null;
    const parsed: unknown = JSON.parse(t);
    return parsed && typeof parsed === "object" ? JSON.stringify(parsed, null, 2) : null;
  } catch {
    return null;
  }
}

function rowToTsv(row: unknown[], columns: { name: string; index: number }[]) {
  return row
    .map((value, index) => {
      const name = columns[index]?.name ?? `col${index + 1}`;
      return `${name}\t${cellToText(value)}`;
    })
    .join("\n");
}

function rowToCsv(row: unknown[], columns: { name: string; index: number }[]) {
  return columns
    .map((col) => {
      const value = row[col.index];
      const text = cellToText(value)
        .replace(/"/g, '""')
        .replace(/\r?\n/g, " ");
      return `"${text}"`;
    })
    .join(",");
}

function ResultGridInner({
  result,
  columnsMeta,
  sort,
  onSort,
  offset = 0,
  hiddenColumns = [],
  draftRow,
  onDraftChange,
  onDraftCommit,
  onDraftCancel,
  onCellEdit,
  cellOverride,
  onRowDelete,
  onDeleteSelected,
  selectedRowIndexes = [],
  onSelectionChange,
  exportContext,
}: Props) {
  const cols = result.columns
    .map((name, index) => ({ name, index }))
    .filter((c) => !hiddenColumns.includes(c.name));
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editingCell, setEditingCell] = useState<CellEditState | null>(null);
  const [anchorRow, setAnchorRow] = useState<number | null>(null);
  const [jsonView, setJsonView] = useState<string | null>(null);
  const [hexView, setHexView] = useState<string | null>(null);
  const [imageView, setImageView] = useState<string | null>(null);
  const [geoView, setGeoView] = useState<string | null>(null);

  const selectRows = (next: number[]) => {
    const deduped = [...new Set(next)].sort((a, b) => a - b);
    onSelectionChange?.(deduped);
  };

  const isSelected = (rowIndex: number) => selectedRowIndexes.includes(rowIndex);

  const handleRowSelect = (
    rowIndex: number,
    event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => {
    if (event.shiftKey && anchorRow !== null) {
      const start = Math.min(anchorRow, rowIndex);
      const end = Math.max(anchorRow, rowIndex);
      const range = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      const next = Array.from(new Set([...selectedRowIndexes, ...range]));
      selectRows(next);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      const next = isSelected(rowIndex)
        ? selectedRowIndexes.filter((index) => index !== rowIndex)
        : [...selectedRowIndexes, rowIndex];
      selectRows(next);
      setAnchorRow(rowIndex);
      return;
    }
    selectRows([rowIndex]);
    setAnchorRow(rowIndex);
  };

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-context-menu='true']")) return;
      setContextMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const handleCopy = (text: string) => {
    if (!text) return;
    void copyText(text);
    setContextMenu(null);
  };

  /** Copy a subset of rows (visible columns only) as JSON / Markdown / INSERTs. */
  const copyRowsAs = (fmt: "json" | "markdown" | "inserts", rows: unknown[][]) => {
    const subset: QueryResult = {
      columns: cols.map((c) => c.name),
      rows: rows.map((r) => cols.map((c) => r[c.index])),
      rowsAffected: null,
    };
    const text =
      fmt === "json"
        ? resultToJson(subset)
        : fmt === "markdown"
          ? resultToMarkdown(subset)
          : resultToInserts(
              subset,
              exportContext?.table ?? "table_name",
              exportContext?.engine ?? "sqlite",
            );
    handleCopy(text);
  };

  const exportButtons = (rows: unknown[][], what: string) => (
    <>
      <div className="my-1 h-px bg-border" />
      {(
        [
          ["json", "JSON"],
          ["markdown", "Markdown"],
          ["inserts", "INSERTs"],
        ] as const
      ).map(([fmt, label]) => (
        <button
          key={fmt}
          type="button"
          className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
          onClick={() => copyRowsAs(fmt, rows)}
        >
          Copy {what} as {label}
        </button>
      ))}
    </>
  );

  const promptCellEdit = (rowIndex: number, columnName: string, value: unknown) => {
    setEditingCell({
      rowIndex,
      columnName,
      value: value === null || value === undefined ? "" : String(value),
    });
    setContextMenu(null);
  };

  const commitCellValue = (nextValue: string) => {
    if (!editingCell) return;
    onCellEdit?.(editingCell.rowIndex, editingCell.columnName, nextValue);
    setEditingCell(null);
  };

  const renderCellValue = (value: unknown) => {
    if (value === null || value === undefined) {
      return <span className="italic text-muted-foreground">NULL</span>;
    }
    return String(value);
  };

  return (
    <div data-testid="result-grid" className="min-h-0 flex-1 overflow-auto">
      <Table className="border-separate border-spacing-0">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky top-0 z-10 w-10 border-b bg-muted/95 px-2 text-center font-mono text-[10px] text-muted-foreground">
              #
            </TableHead>
            {cols.map((c) => {
              const active = sort?.column === c.name;
              const meta = metaFor(columnsMeta, c.name);
              return (
                <TableHead
                  key={c.name}
                  className={cn(
                    "sticky top-0 z-10 border-b bg-muted/95 px-3 font-normal",
                    onSort && "cursor-pointer select-none hover:bg-muted",
                  )}
                  onClick={() => onSort?.(c.name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const values = result.rows.map((row) => row[c.index]);
                    setContextMenu({
                      kind: "column",
                      x: e.clientX,
                      y: e.clientY,
                      columnName: c.name,
                      values,
                    });
                  }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-mono text-xs font-medium">{c.name}</span>
                    {meta?.dataType ? (
                      <span className="font-mono text-[10px] font-normal text-muted-foreground">
                        {meta.dataType}
                      </span>
                    ) : null}
                    {meta?.isPk ? (
                      <KeyRound className="size-3 text-amber-500" />
                    ) : null}
                    {onSort ? (
                      active ? (
                        sort?.desc ? (
                          <ArrowDown className="size-3 opacity-70" />
                        ) : (
                          <ArrowUp className="size-3 opacity-70" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-30" />
                      )
                    ) : null}
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.map((row, i) => {
            const isActive = isSelected(i);
            return (
              <TableRow
                key={i}
                aria-selected={isActive}
                className={cn(
                  "select-none hover:bg-muted/40",
                  isActive && "bg-primary/15 hover:bg-primary/20",
                )}
                onClick={(e) => handleRowSelect(i, e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleRowSelect(i, e);
                  setContextMenu({
                    kind: "row",
                    x: e.clientX,
                    y: e.clientY,
                    rowIndex: i,
                    row,
                  });
                }}
              >
                <TableCell
                  className={cn(
                    "w-10 border-b border-border/60 px-2 text-center font-mono text-[10px] text-muted-foreground",
                    isActive &&
                      "border-l-2 border-l-primary bg-primary/15 font-semibold text-primary",
                  )}
                >
                  {offset + i + 1}
                </TableCell>
                {cols.map((c) => {
                const cell = row[c.index];
                const queued = cellOverride?.(i, c.name);
                const isEditing =
                  editingCell?.rowIndex === i && editingCell.columnName === c.name;
                return (
                  <TableCell
                    key={`${i}-${c.name}`}
                    className={cn(
                      "max-w-80 truncate border-b border-border/60 px-3 py-1.5 font-mono text-xs",
                      isActive && "bg-primary/15",
                      queued !== undefined && "bg-amber-500/25",
                    )}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        kind: "cell",
                        x: e.clientX,
                        y: e.clientY,
                        rowIndex: i,
                        columnName: c.name,
                        value: cellToText(cell),
                        row,
                      });
                    }}
                    onDoubleClick={() => promptCellEdit(i, c.name, queued ?? cell)}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        className="h-7 w-full rounded border border-border bg-background px-2 font-mono text-xs outline-none"
                        value={editingCell.value}
                        onChange={(e) =>
                          setEditingCell((prev) =>
                            prev
                              ? { ...prev, value: e.target.value }
                              : prev,
                          )
                        }
                        onBlur={() => commitCellValue(editingCell.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitCellValue(editingCell.value);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingCell(null);
                          }
                        }}
                      />
                    ) : (
                      renderCellValue(queued ?? cell)
                    )}
                  </TableCell>
                );
              })}
              </TableRow>
            );
          })}
          {draftRow ? (
            <TableRow className="bg-muted/30">
              <TableCell className="w-10 border-b border-border/60 px-1 text-center">
                <div className="flex items-center justify-center gap-0.5">
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Save row (Enter)"
                    onClick={() => onDraftCommit?.()}
                  >
                    <Check className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title="Cancel (Esc)"
                    onClick={() => onDraftCancel?.()}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </TableCell>
              {cols.map((c) => (
                <TableCell
                  key={`draft-${c.name}`}
                  className="border-b border-border/60 p-0"
                >
                  <input
                    autoFocus={cols[0]?.name === c.name}
                    className="h-8 w-full bg-transparent px-3 font-mono text-xs outline-none"
                    value={draftRow[c.name] ?? ""}
                    placeholder="NULL"
                    onChange={(e) => onDraftChange?.(c.name, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onDraftCommit?.();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        onDraftCancel?.();
                      }
                    }}
                  />
                </TableCell>
              ))}
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      {contextMenu ? (
        <div
          data-context-menu="true"
          className="fixed z-50 min-w-44 rounded-md border border-border bg-popover p-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.kind === "cell" ? (
            <>
              <button
                type="button"
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                onClick={() => handleCopy(contextMenu.value)}
              >
                Copy cell
              </button>
              <button
                type="button"
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                onClick={() => {
                  const rowText = rowToTsv(contextMenu.row, cols);
                  handleCopy(rowText);
                }}
              >
                Copy row
              </button>
              <button
                type="button"
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                onClick={() => {
                  const colText = result.rows
                    .map((row) => cellToText(row[cols.find((c) => c.name === contextMenu.columnName)?.index ?? 0]))
                    .join("\n");
                  handleCopy(colText);
                }}
              >
                Copy column
              </button>
              {prettyJson(contextMenu.value) ? (
                <button
                  type="button"
                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  onClick={() => {
                    setJsonView(prettyJson(contextMenu.value));
                    setContextMenu(null);
                  }}
                >
                  View as JSON
                </button>
              ) : null}
              {classifyCellPreview(contextMenu.value) === "hex" ||
              classifyCellPreview(contextMenu.value) === "image" ? (
                <button
                  type="button"
                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  onClick={() => {
                    const hex = bytesToHexDump(contextMenu.value);
                    if (hex) setHexView(hex);
                    setContextMenu(null);
                  }}
                >
                  View as hex
                </button>
              ) : null}
              {classifyCellPreview(contextMenu.value) === "image" ? (
                <button
                  type="button"
                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  onClick={() => {
                    const url = bytesToImageDataUrl(contextMenu.value);
                    if (url) setImageView(url);
                    setContextMenu(null);
                  }}
                >
                  View as image
                </button>
              ) : null}
              {classifyGeo(contextMenu.value) ? (
                <button
                  type="button"
                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  onClick={() => {
                    const g = classifyGeo(contextMenu.value);
                    if (g) setGeoView(g.text);
                    setContextMenu(null);
                  }}
                >
                  View as geometry
                </button>
              ) : null}
              {onCellEdit ? (
                <button
                  type="button"
                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  onClick={() => promptCellEdit(contextMenu.rowIndex, contextMenu.columnName, contextMenu.value)}
                >
                  Edit cell
                </button>
              ) : null}
              {exportButtons(result.rows, "all rows")}
            </>
          ) : null}

          {contextMenu.kind === "row" ? (
            <>
              {selectedRowIndexes.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                    onClick={() => {
                      const rows = selectedRowIndexes
                        .map((index) => result.rows[index])
                        .filter((row): row is unknown[] => !!row);
                      if (rows.length) { handleCopy(rows.map((row) => rowToTsv(row, cols)).join("\n\n")); }
                    }}
                  >
                    Copy selected rows
                  </button>
                  {exportButtons(
                    selectedRowIndexes
                      .map((index) => result.rows[index])
                      .filter((row): row is unknown[] => !!row),
                    "selected rows",
                  )}
                  {onDeleteSelected ? (
                    <button
                      type="button"
                      className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-red-500 hover:bg-red-500/10"
                      onClick={() => {
                        onDeleteSelected(selectedRowIndexes);
                        setContextMenu(null);
                      }}
                    >
                      Delete selected rows
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                    onClick={() => handleCopy(rowToTsv(contextMenu.row, cols))}
                  >
                    Copy row
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                    onClick={() => handleCopy(rowToCsv(contextMenu.row, cols))}
                  >
                    Copy row CSV
                  </button>
                  {exportButtons([contextMenu.row], "row")}
                  {onRowDelete ? (
                    <button
                      type="button"
                      className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-red-500 hover:bg-red-500/10"
                      onClick={() => {
                        onRowDelete(contextMenu.rowIndex);
                        setContextMenu(null);
                      }}
                    >
                      Delete row
                    </button>
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {contextMenu.kind === "column" ? (
            <>
              <button
                type="button"
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                onClick={() => handleCopy(contextMenu.columnName)}
              >
                Copy column name
              </button>
              <button
                type="button"
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                onClick={() =>
                  handleCopy(
                    contextMenu.values
                      .map((value) => cellToText(value))
                      .join("\n"),
                  )
                }
              >
                Copy column values
              </button>
              {exportButtons(result.rows, "all rows")}
            </>
          ) : null}
        </div>
      ) : null}

      <Dialog open={jsonView != null} onOpenChange={(o) => !o && setJsonView(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>JSON</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded border border-border bg-muted/30 p-3 font-mono text-xs">
            {jsonView}
          </pre>
        </DialogContent>
      </Dialog>

      <Dialog open={hexView != null} onOpenChange={(o) => !o && setHexView(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Hex</DialogTitle>
          </DialogHeader>
          <pre
            data-testid="cell-hex-view"
            className="max-h-[60vh] overflow-auto rounded border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed"
          >
            {hexView}
          </pre>
        </DialogContent>
      </Dialog>

      <Dialog open={geoView != null} onOpenChange={(o) => !o && setGeoView(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Geometry</DialogTitle>
          </DialogHeader>
          <pre
            data-testid="cell-geo-view"
            className="max-h-[60vh] overflow-auto rounded border border-border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap"
          >
            {geoView}
          </pre>
        </DialogContent>
      </Dialog>

      <Dialog open={imageView != null} onOpenChange={(o) => !o && setImageView(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Image</DialogTitle>
          </DialogHeader>
          {imageView ? (
            <img
              data-testid="cell-image-view"
              src={imageView}
              alt="cell"
              className="max-h-[60vh] w-full object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const ResultGrid = memo(ResultGridInner);
