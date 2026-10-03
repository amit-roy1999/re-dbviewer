import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EditorView, basicSetup } from "codemirror";
import { sql } from "@codemirror/lang-sql";
import { keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import {
  ArrowLeft,
  Play,
  Table2,
  Eye,
  Shield,
  Plus,
  X,
  Download,
  Loader2,
  Code2,
  Wrench,
  Search,
  KeyRound,
  RefreshCw,
  Minus,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  FilterJoin,
  FilterOp,
  QueryResult,
  SavedConnection,
  SchemaNode,
  TableDetails,
  TableFilter,
  TableSort,
} from "@/types";
import { isRestricted } from "@/types";
import { ResultGrid } from "@/components/ResultGrid";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Props = {
  connection: SavedConnection;
  onBack: () => void;
};

type StructSection = "columns" | "indexes" | "relations";

type Tab =
  | { kind: "sql"; id: "sql" }
  | {
      kind: "data";
      id: string;
      table: string;
      offset: number;
      filters: TableFilter[];
      sort: TableSort | null;
    }
  | {
      kind: "structure";
      id: string;
      table: string;
      section: StructSection;
    };

const PAGE = 100;

const OPS: { id: FilterOp; label: string }[] = [
  { id: "eq", label: "equals" },
  { id: "ne", label: "not equals" },
  { id: "gt", label: "gt" },
  { id: "gte", label: "gte" },
  { id: "lt", label: "lt" },
  { id: "lte", label: "lte" },
  { id: "like", label: "like" },
  { id: "is_null", label: "is null" },
  { id: "is_not_null", label: "not null" },
];

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none dark:[color-scheme:dark]";

function tableRef(schema: string, name: string, engine: string) {
  if (engine === "sqlite" || schema === "main" || schema === "dbo") {
    return name;
  }
  return `${schema}.${name}`;
}

function shortTable(table: string) {
  const i = table.lastIndexOf(".");
  return i >= 0 ? table.slice(i + 1) : table;
}

export default function Workspace({ connection, onBack }: Props) {
  const [schema, setSchema] = useState<SchemaNode[]>([]);
  const [schemaReady, setSchemaReady] = useState(false);
  const [filter, setFilter] = useState("");
  const [tabs, setTabs] = useState<Tab[]>([{ kind: "sql", id: "sql" }]);
  const [active, setActive] = useState("sql");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [details, setDetails] = useState<TableDetails | null>(null);
  const [colFilter, setColFilter] = useState("");
  const [draftFilters, setDraftFilters] = useState<TableFilter[]>([
    { column: "", op: "eq", value: "" },
  ]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [draftRow, setDraftRow] = useState<Record<string, string> | null>(
    null,
  );
  const editorHost = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const runSqlRef = useRef<() => void>(() => {});
  const sqlText = useRef(
    connection.engine === "sqlite"
      ? "-- Explore tables\nSELECT name FROM sqlite_master\nWHERE type = 'table'\nORDER BY name;"
      : "-- Write a query, then Run\nSELECT 1 AS ok;",
  );

  useEffect(() => {
    setSchemaReady(false);
    invoke<SchemaNode[]>("list_schema")
      .then((nodes) => {
        setSchema(nodes);
        setSchemaReady(true);
      })
      .catch((e) => {
        setError(String(e));
        setSchemaReady(true);
      });
  }, []);

  useEffect(() => {
    if (!editorHost.current || editorRef.current) return;
    const view = new EditorView({
      doc: sqlText.current,
      parent: editorHost.current,
      extensions: [
        basicSetup,
        sql(),
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              runSqlRef.current();
              return true;
            },
          },
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) sqlText.current = u.state.doc.toString();
        }),
      ],
    });
    editorRef.current = view;
    return () => {
      view.destroy();
      editorRef.current = null;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return schema;
    return schema
      .map((s) => ({
        ...s,
        children: s.children.filter((c) => c.name.toLowerCase().includes(q)),
      }))
      .filter((s) => s.children.length > 0);
  }, [schema, filter]);

  const tableCount = useMemo(
    () => schema.reduce((n, s) => n + s.children.length, 0),
    [schema],
  );

  const activeTab = tabs.find((t) => t.id === active);
  const accent = connection.accentColor || "#eab308";

  useEffect(() => {
    if (activeTab?.kind === "data") {
      void loadTable(
        activeTab.table,
        activeTab.offset,
        activeTab.filters,
        activeTab.sort,
      );
      void loadDetails(activeTab.table);
    } else if (activeTab?.kind === "structure") {
      setResult(null);
      void loadDetails(activeTab.table);
    } else {
      setDetails(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    setHiddenColumns([]);
    setDraftRow(null);
  }, [active]);

  useEffect(() => {
    if (activeTab?.kind !== "data") return;
    const defaultCol = details?.columns[0]?.name ?? "";
    if (activeTab.filters.length > 0) {
      setDraftFilters(
        activeTab.filters.map((f) => ({
          column: f.column,
          op: f.op,
          value: f.value ?? "",
          join: f.join,
        })),
      );
    } else {
      setDraftFilters([{ column: defaultCol, op: "eq", value: "" }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!details?.columns.length) return;
    const first = details.columns[0].name;
    setDraftFilters((prev) =>
      prev.map((f) => (f.column ? f : { ...f, column: first })),
    );
  }, [details]);

  useEffect(() => {
    runSqlRef.current = () => {
      void runSql();
    };
  });

  async function back() {
    await invoke("close_connection");
    onBack();
  }

  function openData(table: string) {
    const id = `data:${table}`;
    setTabs((prev) =>
      prev.some((t) => t.id === id)
        ? prev
        : [
            ...prev,
            {
              kind: "data",
              id,
              table,
              offset: 0,
              filters: [],
              sort: null,
            },
          ],
    );
    setActive(id);
  }

  function openStructure(table: string) {
    const id = `struct:${table}`;
    setTabs((prev) =>
      prev.some((t) => t.id === id)
        ? prev
        : [
            ...prev,
            {
              kind: "structure",
              id,
              table,
              section: "columns",
            },
          ],
    );
    setActive(id);
  }

  function quoteIdent(name: string) {
    const q =
      connection.engine === "mysql" || connection.engine === "mariadb"
        ? "`"
        : '"';
    return name
      .split(".")
      .map((p) => `${q}${p}${q}`)
      .join(".");
  }

  function startAddRow() {
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind !== "data") return;
    if (!connection.permissions.allowInsert) {
      setError("INSERT is disabled for this connection");
      return;
    }
    const cols = details?.columns ?? [];
    const next: Record<string, string> = {};
    for (const c of cols) {
      next[c.name] = "";
    }
    setDraftRow(next);
    setError("");
    setStatus("Fill the new row, Enter to save, Esc to cancel");
  }

  async function commitAddRow() {
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind !== "data" || !draftRow) return;
    const cols = details?.columns ?? [];
    if (!cols.length) {
      setError("No column info for insert");
      return;
    }
    const insertCols: string[] = [];
    const insertVals: string[] = [];
    for (const c of cols) {
      const raw = draftRow[c.name] ?? "";
      const autoPk =
        c.isPk && /int|serial|identity/i.test(c.dataType) && raw.trim() === "";
      if (autoPk) continue;
      insertCols.push(quoteIdent(c.name));
      if (raw.trim() === "") {
        insertVals.push("NULL");
      } else {
        insertVals.push(`'${raw.replace(/'/g, "''")}'`);
      }
    }
    if (!insertCols.length) {
      setError("Nothing to insert");
      return;
    }
    const sql = `INSERT INTO ${quoteIdent(tab.table)} (${insertCols.join(", ")}) VALUES (${insertVals.join(", ")})`;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await invoke("run_sql", { sql });
      setDraftRow(null);
      setStatus("Row inserted");
      await loadTable(tab.table, tab.offset, tab.filters, tab.sort);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function toggleColumnHidden(name: string) {
    setHiddenColumns((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
  }

  async function loadDetails(table: string) {
    try {
      setDetails(await invoke<TableDetails>("describe_table", { table }));
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadTable(
    table: string,
    offset: number,
    filters: TableFilter[],
    sort: TableSort | null,
  ) {
    setBusy(true);
    setError("");
    try {
      const res = await invoke<QueryResult>("preview_table", {
        table,
        limit: PAGE,
        offset,
        filters,
        sort,
      });
      setResult(res);
      setTabs((prev) =>
        prev.map((t) =>
          t.kind === "data" && t.table === table
            ? { ...t, offset, filters, sort }
            : t,
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function updateActiveData(
    patch: Partial<Extract<Tab, { kind: "data" }>>,
    reload = true,
  ) {
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind !== "data") return;
    const next = { ...tab, ...patch, offset: patch.offset ?? 0 };
    setTabs((prev) => prev.map((t) => (t.id === active ? next : t)));
    if (reload) {
      void loadTable(next.table, next.offset, next.filters, next.sort);
    }
  }

  function applyFilters() {
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind !== "data") return;
    const cleaned: TableFilter[] = [];
    for (const f of draftFilters) {
      if (!f.column) continue;
      const needsValue = f.op !== "is_null" && f.op !== "is_not_null";
      if (needsValue && !f.value?.trim()) continue;
      cleaned.push({
        column: f.column,
        op: f.op,
        value: needsValue ? f.value : null,
        join: cleaned.length === 0 ? undefined : (f.join ?? "and"),
      });
    }
    updateActiveData({ filters: cleaned, offset: 0 });
  }

  function addFilterRow() {
    const col = details?.columns[0]?.name ?? draftFilters[0]?.column ?? "";
    setDraftFilters((prev) => [
      ...prev,
      { column: col, op: "eq", value: "", join: "and" },
    ]);
  }

  function removeFilterRow(index: number) {
    setDraftFilters((prev) => {
      if (prev.length <= 1) {
        return [
          { column: details?.columns[0]?.name ?? "", op: "eq", value: "" },
        ];
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function patchFilterRow(index: number, patch: Partial<TableFilter>) {
    setDraftFilters((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
  }

  function toggleSort(column: string) {
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind !== "data") return;
    let sort: TableSort | null;
    if (tab.sort?.column !== column) sort = { column, desc: false };
    else if (!tab.sort.desc) sort = { column, desc: true };
    else sort = null;
    updateActiveData({ sort, offset: 0 });
  }

  async function runSql() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      setResult(await invoke<QueryResult>("run_sql", { sql: sqlText.current }));
      setActive("sql");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv(filtered: boolean) {
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind !== "data") return;
    const path = await save({
      defaultPath: `${shortTable(tab.table)}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const csv = await invoke<string>("export_table_csv", {
        table: tab.table,
        filters: filtered ? tab.filters : [],
        sort: filtered ? tab.sort : null,
      });
      await invoke("write_text_file", { path, contents: csv });
      setStatus(
        filtered ? `Exported filtered CSV → ${path}` : `Exported table CSV → ${path}`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportSql(includeSchema: boolean, includeData: boolean) {
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind !== "data" && tab?.kind !== "structure") return;
    const path = await save({
      defaultPath: `${shortTable(tab.table)}.sql`,
      filters: [{ name: "SQL", extensions: ["sql"] }],
    });
    if (!path) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const sqlDump = await invoke<string>("export_table_sql", {
        table: tab.table,
        includeSchema,
        includeData,
      });
      await invoke("write_text_file", { path, contents: sqlDump });
      setStatus(`Exported SQL → ${path}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(mode: "append" | "replace") {
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind !== "data") return;
    const path = await open({
      multiple: false,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (typeof path !== "string") return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const csv = await invoke<string>("read_text_file", { path });
      const n = await invoke<number>("import_table_csv", {
        table: tab.table,
        csv,
        mode,
      });
      setStatus(`Imported ${n} row(s) (${mode})`);
      await loadTable(tab.table, 0, tab.filters, tab.sort);
      await loadDetails(tab.table);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importSqlFile() {
    const path = await open({
      multiple: false,
      filters: [{ name: "SQL", extensions: ["sql"] }],
    });
    if (typeof path !== "string") return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const sqlFile = await invoke<string>("read_text_file", { path });
      const n = await invoke<number>("run_sql_script", { sql: sqlFile });
      setStatus(`Ran ${n} statement(s)`);
      const tab = tabs.find((t) => t.id === active);
      if (tab?.kind === "data") {
        await loadTable(tab.table, 0, tab.filters, tab.sort);
        await loadDetails(tab.table);
      }
      setSchema(await invoke<SchemaNode[]>("list_schema"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyViewToSql() {
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind !== "data") return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const sqlDump = await invoke<string>("export_table_sql", {
        table: tab.table,
        includeSchema: false,
        includeData: true,
      });
      await navigator.clipboard.writeText(sqlDump);
      setStatus("Copied INSERT SQL to clipboard");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function closeTab(id: string) {
    if (id === "sql") return;
    setTabs((prev) => prev.filter((t) => t.id !== id));
    if (active === id) setActive("sql");
  }

  function setStructSection(section: StructSection) {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === active && t.kind === "structure" ? { ...t, section } : t,
      ),
    );
  }

  const footerMsg = error || status;
  const activeTableName =
    activeTab?.kind === "data" || activeTab?.kind === "structure"
      ? activeTab.table
      : null;

  const visibleColumns = useMemo(() => {
    if (!details) return [];
    const q = colFilter.trim().toLowerCase();
    if (!q) return details.columns;
    return details.columns.filter((c) => c.name.toLowerCase().includes(q));
  }, [details, colFilter]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        {/* Entity browser */}
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-card">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 min-w-0 flex-1 justify-start px-2 text-xs"
              onClick={back}
            >
              <ArrowLeft className="size-3.5" />
              Connections
            </Button>
            <ThemeToggle />
          </div>

          <div className="border-b border-border px-3 py-2">
            <div className="truncate text-sm font-semibold">
              {connection.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="font-mono text-[10px]">
                {connection.engine}
              </Badge>
              {isRestricted(connection.permissions) ? (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Shield className="size-3" />
                  restricted
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="px-2 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-8"
                placeholder="Filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                disabled={!schemaReady}
              />
            </div>
          </div>

          <div className="px-3 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Entities {schemaReady ? tableCount : "…"}
          </div>

          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-0.5 px-1.5 pb-2">
              {!schemaReady ? (
                <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading…
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  {filter.trim() ? "No matches." : "No tables."}
                </div>
              ) : (
                filtered.map((schemaNode) => (
                  <div key={schemaNode.name}>
                    {connection.engine !== "sqlite" ? (
                      <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground">
                        {schemaNode.name}
                      </div>
                    ) : null}
                    {schemaNode.children.map((c) => {
                      const full = tableRef(
                        schemaNode.name,
                        c.name,
                        connection.engine,
                      );
                      const selected = activeTableName === full;
                      return (
                        <div
                          key={full}
                          className={cn(
                            "group flex items-center rounded-md",
                            selected && "bg-muted",
                          )}
                        >
                          <button
                            type="button"
                            className="flex h-8 min-w-0 flex-1 items-center gap-1.5 px-2 text-left text-xs hover:bg-muted/80"
                            onClick={() => openData(full)}
                            onDoubleClick={() => openStructure(full)}
                          >
                            {c.kind === "view" ? (
                              <Eye className="size-3.5 shrink-0 opacity-60" />
                            ) : (
                              <Table2 className="size-3.5 shrink-0 opacity-60" />
                            )}
                            <span className="truncate">{c.name}</span>
                          </button>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="mr-1 rounded p-1 opacity-0 hover:bg-background group-hover:opacity-100"
                                onClick={() => openStructure(full)}
                              >
                                <Wrench className="size-3.5 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Structure</TooltipContent>
                          </Tooltip>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Main */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Tab strip */}
          <div className="flex items-stretch border-b border-border bg-card">
            <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
              {tabs.map((t) => {
                const isActive = t.id === active;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActive(t.id)}
                    className={cn(
                      "group relative flex h-9 shrink-0 items-center gap-1.5 border-r border-border px-3 text-xs",
                      isActive
                        ? "bg-background text-foreground"
                        : "bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {isActive ? (
                      <span
                        className="absolute inset-x-0 top-0 h-0.5"
                        style={{ backgroundColor: accent }}
                      />
                    ) : null}
                    {t.kind === "sql" ? (
                      <Code2 className="size-3.5" />
                    ) : t.kind === "data" ? (
                      <Table2 className="size-3.5" />
                    ) : (
                      <Wrench className="size-3.5" />
                    )}
                    <span className="font-mono">
                      {t.kind === "sql"
                        ? "Query"
                        : t.kind === "data"
                          ? `${shortTable(t.table)} [all]`
                          : shortTable(t.table)}
                    </span>
                    {t.kind !== "sql" ? (
                      <span
                        role="button"
                        tabIndex={0}
                        className="ml-1 rounded px-0.5 opacity-50 hover:bg-muted hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(t.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            closeTab(t.id);
                          }
                        }}
                      >
                        <X className="size-3" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1 border-l border-border px-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => setActive("sql")}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Focus query tab</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* SQL pane — keep mounted */}
          <div
            className={
              active === "sql"
                ? "flex min-h-0 flex-1 flex-col"
                : "pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
            }
            aria-hidden={active !== "sql"}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
              <span className="text-[11px] text-muted-foreground">
                SQL editor
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void runSql()}
                    style={{ backgroundColor: accent, color: "#111" }}
                    className="hover:opacity-90"
                  >
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    Run
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ctrl/⌘ + Enter</TooltipContent>
              </Tooltip>
            </div>
            <div
              ref={editorHost}
              className={cn(
                "overflow-auto border-b border-border bg-card",
                result && active === "sql" ? "h-52 shrink-0" : "min-h-0 flex-1",
              )}
            />
            {active === "sql" && !result && !busy ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-muted-foreground">
                <div className="grid gap-2 font-mono text-xs">
                  <div className="flex justify-between gap-10">
                    <span>Run query</span>
                    <span>Ctrl/⌘ + Enter</span>
                  </div>
                  <div className="flex justify-between gap-10">
                    <span>Open table</span>
                    <span>Click entity</span>
                  </div>
                  <div className="flex justify-between gap-10">
                    <span>Table structure</span>
                    <span>Wrench / double-click</span>
                  </div>
                </div>
              </div>
            ) : null}
            {active === "sql" && result ? (
              <ResultGrid result={result} />
            ) : null}
          </div>

          {/* Data pane */}
          {activeTab?.kind === "data" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="space-y-1.5 border-b border-border bg-card/40 px-2 py-2">
                {draftFilters.map((f, i) => {
                  const needsValue =
                    f.op !== "is_null" && f.op !== "is_not_null";
                  return (
                    <div
                      key={i}
                      className="flex flex-wrap items-center gap-1.5"
                    >
                      <div className="flex h-8 w-10 shrink-0 items-center justify-center">
                        {i === 0 ? (
                          <Code2 className="size-3.5 text-muted-foreground" />
                        ) : (
                          <button
                            type="button"
                            className="text-[10px] font-semibold tracking-wide text-muted-foreground hover:text-foreground"
                            title="Toggle AND / OR"
                            onClick={() =>
                              patchFilterRow(i, {
                                join: (f.join === "or" ? "and" : "or") as FilterJoin,
                              })
                            }
                          >
                            {(f.join ?? "and").toUpperCase()}
                          </button>
                        )}
                      </div>
                      <select
                        className={selectClass}
                        value={f.column}
                        onChange={(e) =>
                          patchFilterRow(i, { column: e.target.value })
                        }
                      >
                        {(details?.columns ?? []).map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className={selectClass}
                        value={f.op}
                        onChange={(e) =>
                          patchFilterRow(i, {
                            op: e.target.value as FilterOp,
                          })
                        }
                      >
                        {OPS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {needsValue ? (
                        <Input
                          className="h-8 min-w-[8rem] flex-1 font-mono text-xs"
                          placeholder="Enter Value"
                          value={f.value ?? ""}
                          onChange={(e) =>
                            patchFilterRow(i, { value: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") applyFilters();
                          }}
                        />
                      ) : (
                        <div className="h-8 min-w-[8rem] flex-1" />
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
                        disabled={busy}
                        onClick={() => removeFilterRow(i)}
                        title="Remove filter"
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      {i === 0 ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
                            disabled={busy}
                            onClick={addFilterRow}
                            title="Add filter"
                          >
                            <Plus className="size-3.5" />
                          </Button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={applyFilters}
                            title="Apply filters"
                            className="flex size-8 shrink-0 items-center justify-center rounded-full text-black shadow-sm disabled:opacity-50"
                            style={{ backgroundColor: accent }}
                          >
                            <Search className="size-3.5" />
                          </button>
                        </>
                      ) : (
                        <div className="w-[4.5rem] shrink-0" aria-hidden />
                      )}
                    </div>
                  );
                })}
              </div>

              {result ? (
                <ResultGrid
                  result={result}
                  columnsMeta={details?.columns}
                  sort={activeTab.sort}
                  onSort={toggleSort}
                  offset={activeTab.offset}
                  hiddenColumns={hiddenColumns}
                  draftRow={draftRow}
                  onDraftChange={(column, value) =>
                    setDraftRow((prev) =>
                      prev ? { ...prev, [column]: value } : prev,
                    )
                  }
                  onDraftCommit={() => void commitAddRow()}
                  onDraftCancel={() => {
                    setDraftRow(null);
                    setStatus("");
                  }}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  {busy ? "Loading…" : "No Data"}
                </div>
              )}
            </div>
          ) : null}

          {/* Structure pane */}
          {activeTab?.kind === "structure" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-4 border-b border-border px-4">
                {(
                  [
                    ["columns", "Columns"],
                    ["indexes", "Indexes"],
                    ["relations", "Relations"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={cn(
                      "relative h-9 text-xs",
                      activeTab.section === id
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setStructSection(id)}
                  >
                    {label}
                    {activeTab.section === id ? (
                      <span
                        className="absolute inset-x-0 bottom-0 h-0.5"
                        style={{ backgroundColor: accent }}
                      />
                    ) : null}
                  </button>
                ))}
              </div>

              {activeTab.section === "columns" ? (
                <>
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-8 pl-8"
                        placeholder="Filter columns"
                        value={colFilter}
                        onChange={(e) => setColFilter(e.target.value)}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => void loadDetails(activeTab.table)}
                    >
                      <RefreshCw className="size-3.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8">
                          <Download className="size-3.5" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => void exportSql(true, false)}
                        >
                          SQL schema
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => void exportSql(true, true)}
                        >
                          SQL schema + data
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs">Name</TableHead>
                          <TableHead className="h-8 text-xs">Type</TableHead>
                          <TableHead className="h-8 text-xs">Nullable</TableHead>
                          <TableHead className="h-8 text-xs">
                            Default Value
                          </TableHead>
                          <TableHead className="h-8 text-xs">Primary</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleColumns.map((c) => (
                          <TableRow key={c.name}>
                            <TableCell className="py-2 font-mono text-xs">
                              {c.name}
                            </TableCell>
                            <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                              {c.dataType}
                            </TableCell>
                            <TableCell className="py-2 text-xs">
                              {c.nullable ? "✓" : ""}
                            </TableCell>
                            <TableCell className="max-w-48 truncate py-2 font-mono text-xs text-muted-foreground">
                              {c.defaultValue ?? "(NULL)"}
                            </TableCell>
                            <TableCell className="py-2">
                              {c.isPk ? (
                                <KeyRound className="size-3.5 text-amber-500" />
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : null}

              {activeTab.section === "indexes" ? (
                <div className="min-h-0 flex-1 overflow-auto p-3">
                  {!details?.indexes.length ? (
                    <p className="text-sm text-muted-foreground">No indexes.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs">Name</TableHead>
                          <TableHead className="h-8 text-xs">Unique</TableHead>
                          <TableHead className="h-8 text-xs">Columns</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {details.indexes.map((ix) => (
                          <TableRow key={ix.name}>
                            <TableCell className="py-2 font-mono text-xs">
                              {ix.name}
                            </TableCell>
                            <TableCell className="py-2 text-xs">
                              {ix.unique ? "✓" : ""}
                            </TableCell>
                            <TableCell className="py-2 font-mono text-xs">
                              {ix.columns.join(", ")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              ) : null}

              {activeTab.section === "relations" ? (
                <div className="min-h-0 flex-1 overflow-auto p-3">
                  {!details?.foreignKeys.length ? (
                    <p className="text-sm text-muted-foreground">
                      No foreign keys.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs">Name</TableHead>
                          <TableHead className="h-8 text-xs">Columns</TableHead>
                          <TableHead className="h-8 text-xs">
                            References
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {details.foreignKeys.map((fk) => (
                          <TableRow key={fk.name}>
                            <TableCell className="py-2 font-mono text-xs">
                              {fk.name}
                            </TableCell>
                            <TableCell className="py-2 font-mono text-xs">
                              {fk.columns.join(", ")}
                            </TableCell>
                            <TableCell className="py-2 font-mono text-xs">
                              {fk.refTable}({fk.refColumns.join(", ")})
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>

      <footer className="relative flex h-8 shrink-0 items-center border-t border-border bg-card px-2 text-[11px]">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {activeTab?.kind === "data" ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => openStructure(activeTab.table)}
            >
              <Wrench className="size-3" />
              Structure
            </button>
          ) : activeTab?.kind === "structure" ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => openData(activeTab.table)}
            >
              <Table2 className="size-3" />
              Data
            </button>
          ) : (
            <span className="text-muted-foreground">Query</span>
          )}
          <span className="text-muted-foreground/40">|</span>
          <span
            className={cn(
              "min-w-0 truncate",
              error ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {busy
              ? "Working…"
              : footerMsg ||
                (result
                  ? result.rowsAffected != null
                    ? `${result.rowsAffected} affected`
                    : `${result.rows.length} rows`
                  : "No Data")}
          </span>
        </div>

        {activeTab?.kind === "data" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto flex items-center gap-0.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                disabled={busy || activeTab.offset === 0}
                onClick={() =>
                  updateActiveData({
                    offset: Math.max(0, activeTab.offset - PAGE),
                  })
                }
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="min-w-6 text-center font-mono text-muted-foreground">
                {Math.floor(activeTab.offset / PAGE) + 1}
              </span>

              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                disabled={busy || (result?.rows.length ?? 0) < PAGE}
                onClick={() =>
                  updateActiveData({ offset: activeTab.offset + PAGE })
                }
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}

        {activeTab?.kind === "data" ? (
          <div className="relative z-10 ml-auto flex items-center gap-0.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              disabled={busy}
              onClick={() => updateActiveData({ offset: activeTab.offset })}
            >
              <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              disabled={busy}
              onClick={startAddRow}
              title="Add row"
            >
              <Plus className="size-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  disabled={busy}
                >
                  <Settings className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => void exportCsv(false)}>
                  Export whole table
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportCsv(true)}>
                  Export filtered view
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    Hide columns
                    {hiddenColumns.length > 0
                      ? ` (${hiddenColumns.length})`
                      : ""}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 w-44 overflow-auto">
                    {(details?.columns ??
                      result?.columns.map((name) => ({ name })) ??
                      []
                    ).map((c) => (
                      <DropdownMenuItem
                        key={c.name}
                        onSelect={(e) => {
                          e.preventDefault();
                          toggleColumnHidden(c.name);
                        }}
                      >
                        <span
                          className={cn(
                            "font-mono text-xs",
                            hiddenColumns.includes(c.name) &&
                              "text-muted-foreground line-through",
                          )}
                        >
                          {c.name}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void importCsv("append")}>
                  Import from file
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void importSqlFile()}>
                  Import SQL file
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void copyViewToSql()}>
                  Copy view to SQL
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="ml-auto" />
        )}
      </footer>
    </div>
  );
}
