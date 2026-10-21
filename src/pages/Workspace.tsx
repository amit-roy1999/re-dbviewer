import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import type { SQLNamespace } from "@codemirror/lang-sql";
import {
  sql,
  PostgreSQL,
  MySQL,
  MariaSQL,
  MSSQL,
  SQLite,
} from "@codemirror/lang-sql";
import { keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { isDomDark, sqlHighlightExt } from "@/lib/cmSqlHighlight";
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Activity,
  FolderOpen,
  Save,
  AlignLeft,
  BookMarked,
  Pencil,
  Rows3,
  Braces,
  Square,
  ListChecks,
  BookOpen,
  Trash2,
  Database,
  MoreHorizontal,
} from "lucide-react";
import {
  open,
  save,
  confirm as confirmNative,
} from "@tauri-apps/plugin-dialog";
import type {
  ColumnInfo,
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
import { VisualExplain } from "@/components/VisualExplain";
import { JsonResultView } from "@/components/JsonResultView";
import { RelationQueryBuilder } from "@/components/RelationQueryBuilder";
import { QueryHistoryPanel } from "@/components/QueryHistoryPanel";
import { SnippetsPanel } from "@/components/SnippetsPanel";
import { ResultPinBar, type PinnedResult } from "@/components/ResultPinBar";
import { TableTemplatesDialog } from "@/components/TableTemplatesDialog";
import { EventDialog } from "@/components/EventDialog";
import { TriggerDialog } from "@/components/TriggerDialog";
import { SchemaInspectorDialog } from "@/components/SchemaInspectorDialog";
import { DumpTablesDialog } from "@/components/DumpTablesDialog";
import { SessionInfoStrip } from "@/components/SessionInfoStrip";
import { BatchEditBar } from "@/components/BatchEditBar";
import { comparePlans } from "@/lib/explainCompare";
import {
  deleteBookmark,
  listBookmarks,
  saveBookmark,
  type Bookmark,
} from "@/lib/bookmarks";
import { jsonToInserts } from "@/lib/importJson";
import { TableEditor } from "@/components/TableEditor";
import { ContextHelpPanel } from "@/components/ContextHelpPanel";
import {
  GlobalSearchDialog,
  type SearchHit,
} from "@/components/GlobalSearchDialog";
import {
  TableInspectorDialog,
  type InspectorData,
} from "@/components/TableInspectorDialog";
import { PromptDialog, type PromptRequest } from "@/components/PromptDialog";
import { RoutineEditor, ViewEditor } from "@/components/ObjectEditors";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  buildExplainSql,
  isReadSql,
} from "@/lib/explainSql";
import { splitStatements, sqlToExecute } from "@/lib/sqlStatement";
import { formatSql } from "@/lib/formatSql";
import {
  loadHistory,
  pushHistory,
  type HistoryEntry,
} from "@/lib/queryHistory";
import { csvFromResult } from "@/lib/csvFromResult";
import {
  EXPORT_FORMATS,
  formatResult,
  type ExportFormat,
} from "@/lib/resultExport";
import { copyText, registerEditor } from "@/lib/clipboard";
import {
  duplicateTableSql,
  qualifySibling,
  selectTopSql,
} from "@/lib/tableMenuSql";
import {
  loadPreferences,
  usePreferences,
  type AppPreferences,
} from "@/lib/preferences";
import { isDestructiveSql } from "@/lib/destructiveSql";
import {
  ROUTINES_SQL,
  buildRoutineStatements,
  buildViewSql as buildViewDdl,
  createSchemaSql,
  dropSchemaSql,
  extractRoutineBody,
  extractViewBody,
  isMysqlLike,
  renameTableSql,
  renamedRef,
  routineTemplate,
  routinesFromResult,
  showCreateRoutineSql,
  viewDefinitionSql,
  type RoutineInfo,
  type RoutineKind,
} from "@/lib/objectDdl";
import {
  deleteUserSnippet,
  listSnippets,
  saveUserSnippet,
  type Snippet,
} from "@/lib/snippets";
import {
  buildSqlSchemaMap,
  columnsFromDetails,
} from "@/lib/sqlSchemaCompletions";
import {
  buildAlterSql,
  EMPTY_ADVANCED,
  applyAdvancedOptions,
  buildCreateTableSql,
  columnsToEditable,
  defaultNewTableColumns,
  fksToEditable,
  hasExecutableSql,
  indexesToEditable,
  stripCommentLines,
  type EditableColumn,
  type EditableFk,
  type EditableIndex,
  type TableAdvanced,
} from "@/lib/tableDdl";
import type { WorkspaceActions } from "@/lib/workspaceActions";
import {
  DEFAULT_ADMIN_VIEW,
  type AdminViewId,
} from "@/lib/adminNav";
import { adminSupported } from "@/lib/adminSql";
import {
  formatTableStatsLine,
  parseTableStats,
  tableStatsSql,
  type TableStats,
} from "@/lib/tableStats";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminWorkbench } from "@/components/admin/AdminWorkbench";
import { ResizeHandle, clamp } from "@/components/ResizeHandle";
import type { ToolId } from "@/components/tools/ToolsHost";
import { logError } from "@/lib/diagnostics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  /** Called with stable menu actions on mount, and `null` on unmount. */
  onActionsReady?: (actions: WorkspaceActions | null) => void;
  /** False when another connection tab is in front (keeps state, ignores shortcuts). */
  visible?: boolean;
  /** Open a Tools dialog (e.g. EER from the table ⋯ menu). */
  onOpenTool?: (tool: ToolId) => void;
};

type StructSection = "columns" | "indexes" | "relations";

type SqlTab = {
  kind: "sql";
  id: string;
  label: string;
  filePath?: string | null;
};
type DataTab = {
  kind: "data";
  id: string;
  table: string;
  offset: number;
  filters: TableFilter[];
  sort: TableSort | null;
};
type StructureTab = {
  kind: "structure";
  id: string;
  table: string;
  section: StructSection;
};
type TableEditTab = {
  kind: "tableEdit";
  id: string;
  table: string;
  mode: "create" | "alter";
  columns: EditableColumn[];
  originalColumns: EditableColumn[];
  indexes: EditableIndex[];
  originalIndexes: EditableIndex[];
  fks: EditableFk[];
  originalFks: EditableFk[];
  /** MySQL / MariaDB table options (D12). */
  advanced?: TableAdvanced;
};
type ViewEditTab = {
  kind: "viewEdit";
  id: string;
  name: string;
  body: string;
  mode: "create" | "alter";
};
type RoutineTab = {
  kind: "routine";
  id: string;
  name: string;
  routineKind: RoutineKind;
  body: string;
  mode: "create" | "alter";
};

type Tab =
  | SqlTab
  | DataTab
  | StructureTab
  | TableEditTab
  | ViewEditTab
  | RoutineTab;

/** Outcome of one statement in "Run script". */
type StatementResult = {
  sql: string;
  ok: boolean;
  result?: QueryResult;
  error?: string;
  durationMs: number;
};

/** Per query-tab result state (SQL text lives in `sqlRef`). */
type QState = {
  result: QueryResult | null;
  explainResult: QueryResult | null;
  /** Plan from the run before the current Explain (G2). */
  prevExplainResult: QueryResult | null;
  explainView: "table" | "chart";
  analyzeExplain: boolean;
  lastSql: string;
  durationMs: number | null;
  /** Set when the result came from a single-table SELECT with a usable PK. */
  editMeta: { table: string; columns: ColumnInfo[] } | null;
  /** Per-statement results from "Run script" (null for single runs). */
  script: StatementResult[] | null;
  scriptIdx: number;
};

const EMPTY_Q: QState = {
  result: null,
  explainResult: null,
  prevExplainResult: null,
  explainView: "table",
  analyzeExplain: false,
  lastSql: "",
  durationMs: null,
  editMeta: null,
  script: null,
  scriptIdx: 0,
};

const PAGE_SIZES = [25, 50, 100, 200, 500];

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

const iconBtn = "h-7 w-7 p-0";

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

function oneLine(sql: string) {
  return sql.replace(/\s+/g, " ").trim().slice(0, 100);
}

function baseName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function dialectFor(engine: string) {
  switch (engine) {
    case "postgres":
      return PostgreSQL;
    case "mysql":
      return MySQL;
    case "mariadb":
      return MariaSQL;
    case "mssql":
      return MSSQL;
    default:
      return SQLite;
  }
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function viewPrefsExt(p: AppPreferences) {
  const size = `${p.editorFontSize}px`;
  return [
    EditorView.theme({
      "&": { fontSize: size },
      ".cm-content": { fontSize: size },
      ".cm-scroller": { fontSize: size },
      ".cm-gutters": { fontSize: size },
    }),
    EditorState.tabSize.of(p.editorTabSize),
    ...(p.editorSoftWrap ? [EditorView.lineWrapping] : []),
  ];
}

const TEXT_TYPE = /char|text|clob|string/i;

function isSearchableType(dataType: string) {
  const t = dataType.trim();
  return t === "" || TEXT_TYPE.test(t);
}

export default function Workspace({
  connection,
  onBack,
  onActionsReady,
  visible = true,
  onOpenTool,
}: Props) {
  const engine = connection.engine;
  const [schema, setSchema] = useState<SchemaNode[]>([]);
  const [schemaReady, setSchemaReady] = useState(false);
  /** Active schema/database in the sidebar. `""` = all schemas. */
  const [selectedSchema, setSelectedSchema] = useState(
    () => connection.config.database?.trim() || "",
  );
  const [filter, setFilter] = useState("");
  const [tabs, setTabs] = useState<Tab[]>([
    { kind: "sql", id: "query-1", label: "Query 1", filePath: null },
  ]);
  const [active, setActive] = useState("query-1");
  const [queries, setQueries] = useState<Record<string, QState>>({});
  const [dataResult, setDataResult] = useState<QueryResult | null>(null);
  const [busyAction, setBusyAction] = useState<
    "run" | "explain" | "script" | null
  >(null);
  const [details, setDetails] = useState<TableDetails | null>(null);
  const [structStats, setStructStats] = useState<{
    table: string;
    loading: boolean;
    stats: TableStats | null;
  } | null>(null);
  const structStatsGen = useRef(0);
  const [colFilter, setColFilter] = useState("");
  const [draftFilters, setDraftFilters] = useState<TableFilter[]>([
    { column: "", op: "eq", value: "" },
  ]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<number[]>([]);
  const [draftRow, setDraftRow] = useState<Record<string, string> | null>(
    null,
  );
  const prefs = usePreferences();
  const [pageSize, setPageSize] = useState(() => loadPreferences().defaultLimit);
  const [dataView, setDataView] = useState<"grid" | "json">("grid");
  const [findText, setFindText] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>(() =>
    loadHistory(connection.id),
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snippets, setSnippets] = useState<Snippet[]>(() =>
    listSnippets(connection.id),
  );
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() =>
    listBookmarks(connection.id),
  );
  const [pinned, setPinned] = useState<PinnedResult | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [schemaInspectOpen, setSchemaInspectOpen] = useState(false);
  const [dumpOpen, setDumpOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"objects" | "admin">(
    "objects",
  );
  const [adminView, setAdminView] =
    useState<AdminViewId>(DEFAULT_ADMIN_VIEW);
  const [sidebarW, setSidebarW] = useState(() => {
    const n = Number(localStorage.getItem("re-dbviewer.sidebarW"));
    return Number.isFinite(n) && n >= 180 ? n : 240;
  });
  const [editorH, setEditorH] = useState(() => {
    const n = Number(localStorage.getItem("re-dbviewer.editorH"));
    return Number.isFinite(n) && n >= 96 ? n : 208;
  });
  /** C13: plain-text session log shown in the history panel's Text mode. */
  const [textLog, setTextLog] = useState<string[]>([]);
  /** E6: queue cell edits and apply them in one transaction. */
  const [batchMode, setBatchMode] = useState(false);
  const [pending, setPending] = useState<{
    result: QueryResult;
    edits: Record<string, { row: number; column: string; value: string }>;
  } | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [columnsCache, setColumnsCache] = useState<Record<string, string[]>>(
    {},
  );
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  /** Session-only: tables hidden from the entity tree via ⋯ → Hide. */
  const [hiddenTables, setHiddenTables] = useState<Set<string>>(() => new Set());
  const [txActive, setTxActive] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpWord, setHelpWord] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [inspector, setInspector] = useState<InspectorData | null>(null);
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
  const [routines, setRoutines] = useState<RoutineInfo[]>([]);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    run: () => Promise<void>;
  } | null>(null);

  const editorHost = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const runSqlRef = useRef<() => void>(() => {});
  const runScriptRef = useRef<() => void>(() => {});
  const [schemaComp] = useState(() => new Compartment());
  const [prefsComp] = useState(() => new Compartment());
  const [highlightComp] = useState(() => new Compartment());
  const schemaMapRef = useRef<Record<string, SQLNamespace>>({});
  const helpOpenRef = useRef(false);
  helpOpenRef.current = helpOpen;
  /** Run counter + "ignore results up to" watermark for the frontend-only Stop. */
  const runSeq = useRef(0);
  const cancelledUpTo = useRef(0);
  /** SQL text per query tab; the single editor shows `ownerRef`'s text. */
  const sqlRef = useRef<Record<string, string>>({
    "query-1":
      connection.engine === "sqlite"
        ? "-- Explore tables\nSELECT name FROM sqlite_master\nWHERE type = 'table'\nORDER BY name;"
        : "-- Write a query, then Run\nSELECT 1 AS ok;",
  });
  const ownerRef = useRef<string | null>("query-1");
  const queryCounter = useRef(1);
  const newTableCounter = useRef(0);
  const prefetchGen = useRef(0);
  const actionsRef = useRef<WorkspaceActions | null>(null);
  const onActionsReadyRef = useRef(onActionsReady);
  onActionsReadyRef.current = onActionsReady;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const activeTab = tabs.find((t) => t.id === active);
  const accent = connection.accentColor || "#eab308";
  const sqlVisible = activeTab?.kind === "sql";
  const q: QState = (activeTab?.kind === "sql" && queries[active]) || EMPTY_Q;

  function setQ(id: string, patch: Partial<QState>) {
    setQueries((prev) => ({ ...prev, [id]: { ...EMPTY_Q, ...prev[id], ...patch } }));
  }

  function logLine(kind: "OK" | "ERR", text: string) {
    const line = `[${new Date().toLocaleTimeString()}] ${kind}  ${text}`;
    setTextLog((prev) => [...prev.slice(-299), line]);
  }

  // ---- schema ---------------------------------------------------------

  async function loadSchema() {
    try {
      const nodes = await invoke<SchemaNode[]>("list_schema");
      setSchema(nodes);
      setSchemaReady(true);
      setSelectedSchema((prev) => {
        if (prev === "") return "";
        if (nodes.some((n) => n.name === prev)) return prev;
        const db = connection.config.database?.trim();
        if (db && nodes.some((n) => n.name === db)) return db;
        return nodes.length === 1 ? nodes[0].name : "";
      });
      void prefetchColumns(nodes);
      void loadRoutines();
    } catch (e) {
      setError(String(e));
      setSchemaReady(true);
      logError("list_schema failed");
    }
  }

  async function selectSchema(name: string) {
    setSelectedSchema(name);
    if (!name || !isMysqlLike(engine)) return;
    try {
      const q = `\`${name.replace(/`/g, "``")}\``;
      await invoke("run_sql", { sql: `USE ${q}` });
      setStatus(`Using database ${name}`);
    } catch (e) {
      setError(String(e));
    }
  }

  /** Best-effort routine list (MySQL / MariaDB) for the tree and autocomplete. */
  async function loadRoutines() {
    if (!isMysqlLike(engine)) {
      setRoutines([]);
      return;
    }
    try {
      const res = await invoke<QueryResult>("run_sql", { sql: ROUTINES_SQL });
      setRoutines(routinesFromResult(res));
    } catch {
      setRoutines([]);
    }
  }

  /** Warm the autocomplete column cache for the first few tables. */
  async function prefetchColumns(nodes: SchemaNode[]) {
    const gen = ++prefetchGen.current;
    const names = nodes
      .flatMap((s) => s.children.map((c) => tableRef(s.name, c.name, engine)))
      .slice(0, 30);
    const found: Record<string, string[]> = {};
    for (const name of names) {
      if (gen !== prefetchGen.current) return;
      try {
        const d = await invoke<TableDetails>("describe_table", { table: name });
        found[name] = columnsFromDetails(d);
      } catch {
        // ignore — autocomplete is best-effort
      }
    }
    if (gen === prefetchGen.current) {
      setColumnsCache((prev) => ({ ...found, ...prev }));
    }
  }

  useEffect(() => {
    setSchemaReady(false);
    void loadSchema();
    return () => {
      prefetchGen.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- editor ---------------------------------------------------------

  useEffect(() => {
    if (!editorHost.current || editorRef.current) return;
    const view = new EditorView({
      doc: sqlRef.current[ownerRef.current ?? ""] ?? "",
      parent: editorHost.current,
      extensions: [
        basicSetup,
        highlightComp.of(sqlHighlightExt(isDomDark())),
        prefsComp.of(viewPrefsExt(loadPreferences())),
        schemaComp.of(
          sql({
            dialect: dialectFor(engine),
            schema: schemaMapRef.current,
            upperCaseKeywords: false,
          }),
        ),
        keymap.of([
          {
            key: "Mod-Shift-Enter",
            run: () => {
              runScriptRef.current();
              return true;
            },
          },
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
          if (u.docChanged && ownerRef.current) {
            sqlRef.current[ownerRef.current] = u.state.doc.toString();
          }
          if ((u.selectionSet || u.docChanged) && helpOpenRef.current) {
            syncHelpWord(u.view);
          }
        }),
      ],
    });
    editorRef.current = view;
    const unregister = registerEditor(view);
    const themeObs = new MutationObserver(() => {
      view.dispatch({
        effects: highlightComp.reconfigure(sqlHighlightExt(isDomDark())),
      });
    });
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      themeObs.disconnect();
      unregister();
      view.destroy();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncHelpWord(view: EditorView) {
    const head = view.state.selection.main.head;
    const w = view.state.wordAt(head);
    setHelpWord(w ? view.state.sliceDoc(w.from, w.to) : "");
  }

  useEffect(() => {
    if (helpOpen && editorRef.current) syncHelpWord(editorRef.current);
  }, [helpOpen]);

  useEffect(() => {
    editorRef.current?.dispatch({
      effects: prefsComp.reconfigure(viewPrefsExt(prefs)),
    });
  }, [prefs, prefsComp]);

  useEffect(() => {
    const map = buildSqlSchemaMap(schema, columnsCache, routines);
    schemaMapRef.current = map;
    editorRef.current?.dispatch({
      effects: schemaComp.reconfigure(
        sql({
          dialect: dialectFor(engine),
          schema: map,
          upperCaseKeywords: false,
        }),
      ),
    });
  }, [schema, columnsCache, routines, engine, schemaComp]);

  /** Show `id`'s SQL in the editor, stashing the previous tab's text. */
  function swapEditor(id: string) {
    const view = editorRef.current;
    if (!view || ownerRef.current === id) return;
    const prev = ownerRef.current;
    if (prev) sqlRef.current[prev] = view.state.doc.toString();
    ownerRef.current = id;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: sqlRef.current[id] ?? "",
      },
      selection: { anchor: 0 },
    });
  }

  function focusSql(id: string) {
    setActive(id);
    swapEditor(id);
  }

  /** Query tab that editor-oriented actions should target. */
  function targetSqlId(): string {
    if (activeTab?.kind === "sql") return activeTab.id;
    const o = ownerRef.current;
    if (o && tabs.some((t) => t.id === o)) return o;
    return tabs.find((t) => t.kind === "sql")?.id ?? "query-1";
  }

  /** Replace the target query tab's SQL. */
  function setEditorSql(text: string) {
    const id = targetSqlId();
    focusSql(id);
    sqlRef.current[id] = text;
    const view = editorRef.current;
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    }
  }

  function newQueryTab(initialSql = "") {
    const n = ++queryCounter.current;
    const id = `query-${n}`;
    sqlRef.current[id] = initialSql;
    setTabs((prev) => [
      ...prev,
      { kind: "sql", id, label: `Query ${n}`, filePath: null },
    ]);
    focusSql(id);
    return id;
  }

  // ---- filtered tree / derived ----------------------------------------

  const filtered = useMemo(() => {
    const qs = filter.trim().toLowerCase();
    const scoped = selectedSchema
      ? schema.filter((s) => s.name === selectedSchema)
      : schema;
    return scoped
      .map((s) => ({
        ...s,
        children: s.children.filter((c) => {
          const full = tableRef(s.name, c.name, engine);
          if (hiddenTables.has(full)) return false;
          if (qs && !c.name.toLowerCase().includes(qs)) return false;
          return true;
        }),
      }))
      .filter((s) => s.children.length > 0);
  }, [schema, filter, selectedSchema, hiddenTables, engine]);

  const tableCount = useMemo(
    () => filtered.reduce((n, s) => n + s.children.length, 0),
    [filtered],
  );

  const tableKinds = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of schema) {
      for (const c of s.children) m[tableRef(s.name, c.name, engine)] = c.kind;
    }
    return m;
  }, [schema, engine]);

  // ---- active-tab effects ---------------------------------------------

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
      setDataResult(null);
      void loadDetails(activeTab.table);
      void loadStructStats(activeTab.table);
    } else {
      setDetails(null);
      setStructStats(null);
    }
    if (activeTab?.kind === "sql") swapEditor(activeTab.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    setHiddenColumns([]);
    setDraftRow(null);
    setSelectedRowIndexes([]);
    setFindText("");
  }, [active]);

  useEffect(() => {
    setSelectedRowIndexes([]);
  }, [findText]);

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

  const activeTableName =
    activeTab?.kind === "data" || activeTab?.kind === "structure"
      ? activeTab.table
      : null;

  useEffect(() => {
    if (activeTableName) setSelectedTable(activeTableName);
  }, [activeTableName]);

  useEffect(() => {
    if (selectedTable && !columnsCache[selectedTable]) {
      void invoke<TableDetails>("describe_table", { table: selectedTable })
        .then((d) =>
          setColumnsCache((prev) => ({
            ...prev,
            [selectedTable]: columnsFromDetails(d),
          })),
        )
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable]);

  useEffect(() => {
    runSqlRef.current = () => {
      void runSql();
    };
    runScriptRef.current = () => {
      void runScript();
    };
  });

  // ---- navigation helpers ---------------------------------------------

  async function back() {
    await invoke("close_connection");
    onBack();
  }

  function openData(table: string, filters: TableFilter[] = []) {
    const id = `data:${table}`;
    setSelectedTable(table);
    const exists = tabs.some((t) => t.id === id);
    setTabs((prev) =>
      prev.some((t) => t.id === id)
        ? filters.length
          ? prev.map((t) =>
              t.id === id && t.kind === "data"
                ? { ...t, filters, offset: 0 }
                : t,
            )
          : prev
        : [
            ...prev,
            {
              kind: "data",
              id,
              table,
              offset: 0,
              filters,
              sort: null,
            },
          ],
    );
    setActive(id);
    // Already on this tab: the [active] effects won't re-run, so refresh by hand.
    if (exists && active === id && filters.length) {
      setDraftFilters(
        filters.map((f) => ({ ...f, value: f.value ?? "" })),
      );
      void loadTable(table, 0, filters, null);
    }
  }

  function openStructure(table: string) {
    const id = `struct:${table}`;
    setSelectedTable(table);
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
    const qc = engine === "mysql" || engine === "mariadb" ? "`" : '"';
    return name
      .split(".")
      .map((p) => `${qc}${p}${qc}`)
      .join(".");
  }

  function filterPredicate(f: TableFilter): string {
    const col = quoteIdent(f.column);
    switch (f.op) {
      case "is_null":
        return `${col} IS NULL`;
      case "is_not_null":
        return `${col} IS NOT NULL`;
      case "eq":
        return `${col} = ${sqlLiteral(f.value ?? "")}`;
      case "ne":
        return `${col} <> ${sqlLiteral(f.value ?? "")}`;
      case "gt":
        return `${col} > ${sqlLiteral(f.value ?? "")}`;
      case "gte":
        return `${col} >= ${sqlLiteral(f.value ?? "")}`;
      case "lt":
        return `${col} < ${sqlLiteral(f.value ?? "")}`;
      case "lte":
        return `${col} <= ${sqlLiteral(f.value ?? "")}`;
      case "like":
        return `${col} LIKE ${sqlLiteral(f.value ?? "")}`;
      default:
        return `${col} = ${sqlLiteral(f.value ?? "")}`;
    }
  }

  function buildViewSql(
    table: string,
    filters: TableFilter[],
    sort: TableSort | null,
    offset: number,
  ): string {
    const safe = quoteIdent(table);
    let out = `SELECT * FROM ${safe}`;
    if (filters.length > 0) {
      let where = filterPredicate(filters[0]);
      for (let i = 1; i < filters.length; i++) {
        const join = (filters[i].join ?? "and").toUpperCase();
        where += ` ${join} ${filterPredicate(filters[i])}`;
      }
      out += ` WHERE ${where}`;
    }
    if (sort) {
      out += ` ORDER BY ${quoteIdent(sort.column)} ${sort.desc ? "DESC" : "ASC"}`;
    }
    out += ` LIMIT ${pageSize} OFFSET ${offset}`;
    return `${out};`;
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
    setStatus("New row — Enter/✓ to save, Esc/✕ to cancel");
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
    const stmt = `INSERT INTO ${quoteIdent(tab.table)} (${insertCols.join(", ")}) VALUES (${insertVals.join(", ")})`;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await invoke("run_sql", { sql: stmt });
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

  async function fetchDetails(table: string): Promise<TableDetails> {
    const d = await invoke<TableDetails>("describe_table", { table });
    setColumnsCache((prev) => ({ ...prev, [table]: columnsFromDetails(d) }));
    return d;
  }

  async function loadDetails(table: string) {
    try {
      setDetails(await fetchDetails(table));
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadStructStats(table: string) {
    const gen = ++structStatsGen.current;
    setStructStats({ table, loading: true, stats: null });
    const sql = tableStatsSql(engine, table);
    if (!sql) {
      if (structStatsGen.current === gen) {
        setStructStats({ table, loading: false, stats: null });
      }
      return;
    }
    try {
      const res = await invoke<QueryResult>("run_sql", { sql });
      if (structStatsGen.current !== gen) return;
      setStructStats({
        table,
        loading: false,
        stats: parseTableStats(engine, res),
      });
    } catch {
      if (structStatsGen.current === gen) {
        setStructStats({ table, loading: false, stats: null });
      }
    }
  }

  async function loadTable(
    table: string,
    offset: number,
    filters: TableFilter[],
    sort: TableSort | null,
    limit = pageSize,
  ) {
    setBusy(true);
    setError("");
    try {
      const res = await invoke<QueryResult>("preview_table", {
        table,
        limit,
        offset,
        filters,
        sort,
      });
      setDataResult(res);
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

  function changePageSize(n: number) {
    setPageSize(n);
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind === "data") {
      void loadTable(tab.table, 0, tab.filters, tab.sort, n);
    }
  }

  function updateActiveData(patch: Partial<DataTab>, reload = true) {
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

  function pkWhere(
    pkNames: string[],
    resultColumns: string[],
    row: unknown[],
  ): string | null {
    const parts: string[] = [];
    for (const name of pkNames) {
      const idx = resultColumns.findIndex(
        (c) => c.toLowerCase() === name.toLowerCase(),
      );
      if (idx < 0) return null;
      parts.push(`${quoteIdent(name)} = ${sqlLiteral(row[idx])}`);
    }
    return parts.join(" AND ");
  }

  async function updateCellValue(
    rowIndex: number,
    column: string,
    nextValue: string,
  ) {
    if (!connection.permissions.allowUpdate) {
      setError("UPDATE is disabled for this connection");
      return;
    }
    const tab = tabs.find((t) => t.id === active);
    let table: string;
    let cols: ColumnInfo[];
    let res: QueryResult | null;
    if (tab?.kind === "data") {
      if (!details?.columns.length) {
        setError("Table metadata is not loaded yet.");
        return;
      }
      table = tab.table;
      cols = details.columns;
      res = dataResult;
    } else if (tab?.kind === "sql" && queries[tab.id]?.editMeta) {
      const meta = queries[tab.id].editMeta!;
      table = meta.table;
      cols = meta.columns;
      res = queries[tab.id].result;
    } else {
      return;
    }
    const row = res?.rows[rowIndex];
    if (!res || !row) {
      setError("Could not locate the row to update.");
      return;
    }
    const pkColumns = cols.filter((c) => c.isPk).map((c) => c.name);
    if (!pkColumns.length) {
      setError("This table has no primary key; direct cell editing is disabled.");
      return;
    }
    const where = pkWhere(pkColumns, res.columns, row);
    if (!where) {
      setError("Primary key columns are not in this result.");
      return;
    }
    const stmt = `UPDATE ${quoteIdent(table)} SET ${quoteIdent(column)} = ${sqlLiteral(nextValue)} WHERE ${where}`;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await invoke("run_sql", { sql: stmt });
      if (tab.kind === "data") {
        setStatus("Cell updated");
        await loadTable(tab.table, tab.offset, tab.filters, tab.sort);
        await loadDetails(tab.table);
      } else {
        const meta = queries[tab.id].editMeta;
        await execute(tab.id, queries[tab.id].lastSql, meta);
        setStatus("Cell updated");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- E6: batched cell edits ----------------------------------------------

  /** Table, columns and result the current grid edits apply to (null if not editable). */
  function editContext() {
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind === "data") {
      if (!details?.columns.length || !dataResult) return null;
      return { tab, table: tab.table, cols: details.columns, res: dataResult };
    }
    if (tab?.kind === "sql") {
      const meta = queries[tab.id]?.editMeta;
      const res = queries[tab.id]?.result;
      if (!meta || !res) return null;
      return { tab, table: meta.table, cols: meta.columns, res };
    }
    return null;
  }

  /** Grid edit handler: queue the edit in batch mode, else UPDATE immediately. */
  function handleCellEdit(rowIndex: number, column: string, value: string) {
    if (!batchMode) {
      void updateCellValue(rowIndex, column, value);
      return;
    }
    const ctx = editContext();
    if (!ctx) return;
    if (!connection.permissions.allowUpdate) {
      setError("UPDATE is disabled for this connection");
      return;
    }
    const orig = ctx.res.rows[rowIndex]?.[ctx.res.columns.indexOf(column)];
    const same = (orig == null ? "" : String(orig)) === value;
    const key = `${rowIndex}\u0000${column}`;
    setPending((prev) => {
      const base = prev && prev.result === ctx.res ? prev.edits : {};
      const { [key]: _old, ...others } = base;
      return {
        result: ctx.res,
        edits: same ? others : { ...others, [key]: { row: rowIndex, column, value } },
      };
    });
  }

  async function applyPending() {
    const ctx = editContext();
    const edits = pending && ctx && pending.result === ctx.res ? pending.edits : null;
    if (!ctx || !edits) return;
    if (!connection.permissions.allowUpdate) {
      setError("UPDATE is disabled for this connection");
      return;
    }
    const pkColumns = ctx.cols.filter((c) => c.isPk).map((c) => c.name);
    if (!pkColumns.length) {
      setError("This table has no primary key; direct cell editing is disabled.");
      return;
    }
    const byRow = new Map<number, { column: string; value: string }[]>();
    for (const e of Object.values(edits)) {
      byRow.set(e.row, [...(byRow.get(e.row) ?? []), e]);
    }
    const stmts: string[] = [];
    for (const [row, changes] of byRow) {
      const r = ctx.res.rows[row];
      const where = r ? pkWhere(pkColumns, ctx.res.columns, r) : null;
      if (!where) {
        setError("Primary key columns are not in this result.");
        return;
      }
      const sets = changes
        .map((c) => `${quoteIdent(c.column)} = ${sqlLiteral(c.value)}`)
        .join(", ");
      stmts.push(`UPDATE ${quoteIdent(ctx.table)} SET ${sets} WHERE ${where}`);
    }
    const count = Object.keys(edits).length;
    const wrap = !txActive; // inside the user's own transaction: leave COMMIT to them
    let started = false;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (wrap) {
        await invoke("run_sql", { sql: engine === "mssql" ? "BEGIN TRAN" : "BEGIN" });
        started = true;
      }
      for (const sql of stmts) await invoke("run_sql", { sql });
      if (wrap) {
        await invoke("run_sql", { sql: "COMMIT" });
        started = false;
      }
      setPending(null);
      if (ctx.tab.kind === "data") {
        await loadTable(ctx.tab.table, ctx.tab.offset, ctx.tab.filters, ctx.tab.sort);
        await loadDetails(ctx.tab.table);
      } else {
        const qs = queries[ctx.tab.id];
        await execute(ctx.tab.id, qs.lastSql, qs.editMeta);
      }
      const msg = `Applied ${count} change(s) in ${stmts.length} UPDATE(s)${wrap ? " (committed)" : " (in your open transaction)"}`;
      setStatus(msg);
      logLine("OK", msg);
    } catch (e) {
      if (started) {
        try {
          await invoke("run_sql", { sql: "ROLLBACK" });
        } catch {
          // session gone; nothing to roll back
        }
      }
      setError(`${String(e)}${started ? " — rolled back; edits kept" : ""}`);
      logLine("ERR", `Batch apply failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(rowIndex: number) {
    await deleteSelectedRows([rowIndex]);
  }

  async function deleteSelectedRows(rowIndexes: number[]) {
    if (!rowIndexes.length) return;
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind !== "data") return;
    if (!details?.columns.length) {
      setError("Table metadata is not loaded yet.");
      return;
    }
    if (!connection.permissions.allowDelete) {
      setError("DELETE is disabled for this connection");
      return;
    }
    const ordered = [...new Set(rowIndexes)].sort((a, b) => a - b);
    if (
      loadPreferences().confirmDestructive &&
      !(await askNative(
        `Delete ${ordered.length} row(s) from ${tab.table}?`,
        "Confirm delete",
      ))
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    try {
      for (const index of ordered) {
        const row = dataResult?.rows[index];
        if (!row || !dataResult) continue;
        const pkColumns = details.columns.filter((c) => c.isPk).map((c) => c.name);
        if (!pkColumns.length) {
          throw new Error("This table has no primary key; row deletion is disabled.");
        }
        const where = pkWhere(pkColumns, dataResult.columns, row);
        if (!where) throw new Error("Primary key columns are not in this result.");
        await invoke("run_sql", {
          sql: `DELETE FROM ${quoteIdent(tab.table)} WHERE ${where}`,
        });
      }
      setSelectedRowIndexes([]);
      await loadTable(tab.table, tab.offset, tab.filters, tab.sort);
      await loadDetails(tab.table);
      setStatus(
        ordered.length === 1 ? "Row deleted" : `Deleted ${ordered.length} row(s)`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- run / explain ----------------------------------------------------

  /** If `stmt` is a simple single-table SELECT whose PK is in the result, return edit metadata. */
  async function detectEditMeta(
    stmt: string,
    res: QueryResult,
  ): Promise<QState["editMeta"]> {
    if (!connection.permissions.allowUpdate || !res.columns.length) return null;
    const text = stmt
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();
    if (!/^select\b/i.test(text)) return null;
    if (/\b(join|union|intersect|except|group\s+by|having|distinct)\b/i.test(text))
      return null;
    if ((text.match(/\bfrom\b/gi) ?? []).length !== 1) return null;
    const ident = '(?:[\\w$]+|"[^"]+"|`[^`]+`|\\[[^\\]]+\\])';
    const m = text.match(
      new RegExp(`\\bfrom\\s+(${ident}(?:\\.${ident})*)(\\s*,)?`, "i"),
    );
    if (!m || m[2]) return null;
    const raw = m[1]
      .split(/\.(?=(?:[^"`\]]|"[^"]*"|`[^`]*`|\[[^\]]*\])*$)/)
      .map((p) => p.replace(/^["`[]|["`\]]$/g, ""))
      .join(".")
      .toLowerCase();
    let full: string | null = null;
    for (const s of schema) {
      for (const c of s.children) {
        if (c.kind === "view") continue;
        const f = tableRef(s.name, c.name, engine);
        if (f.toLowerCase() === raw) {
          full = f;
          break;
        }
        if (!full && c.name.toLowerCase() === raw) full = f;
      }
      if (full && full.toLowerCase() === raw) break;
    }
    if (!full) return null;
    try {
      const d = await fetchDetails(full);
      const pks = d.columns.filter((c) => c.isPk);
      if (!pks.length) return null;
      const have = res.columns.map((c) => c.toLowerCase());
      if (!pks.every((c) => have.includes(c.name.toLowerCase()))) return null;
      return { table: full, columns: d.columns };
    } catch {
      return null;
    }
  }

  /** Ask before DROP / TRUNCATE / DELETE when the preference is on. */
  async function confirmDestructive(stmts: string[]): Promise<boolean> {
    if (!loadPreferences().confirmDestructive) return true;
    const bad = stmts.filter(isDestructiveSql);
    if (!bad.length) return true;
    return askNative(
      `${bad.length === 1 ? "This statement is" : `${bad.length} statements are`} destructive:\n\n${bad[0].slice(0, 240)}${bad.length > 1 ? "\n…" : ""}\n\nRun it?`,
      "Confirm destructive SQL",
    );
  }

  async function askNative(message: string, title = "Confirm"): Promise<boolean> {
    try {
      return await confirmNative(message, { title, kind: "warning" });
    } catch {
      return window.confirm(message);
    }
  }

  const isCancelled = (token: number) => token <= cancelledUpTo.current;

  /** Frontend-only cancel: late results are ignored (the server keeps running). */
  function stopRun() {
    if (!busyAction) return;
    cancelledUpTo.current = runSeq.current;
    setBusy(false);
    setBusyAction(null);
    setError("");
    setStatus("Stopped — late result ignored (server may still finish the statement)");
  }

  async function execute(
    id: string,
    stmt: string,
    knownMeta?: QState["editMeta"],
  ): Promise<boolean> {
    const token = ++runSeq.current;
    setBusy(true);
    setBusyAction("run");
    setError("");
    setStatus("");
    const t0 = performance.now();
    try {
      const res = await invoke<QueryResult>("run_sql", { sql: stmt });
      if (isCancelled(token)) return false;
      const ms = Math.round(performance.now() - t0);
      setQ(id, {
        result: res,
        explainResult: null,
        script: null,
        scriptIdx: 0,
        lastSql: stmt,
        durationMs: ms,
        editMeta: knownMeta ?? null,
      });
      setHistory(
        pushHistory(connection.id, {
          sql: stmt,
          ok: true,
          durationMs: ms,
          message:
            res.rowsAffected != null
              ? `${res.rowsAffected} affected`
              : `${res.rows.length} rows`,
        }),
      );
      logLine(
        "OK",
        `${res.rowsAffected != null ? `${res.rowsAffected} affected` : `${res.rows.length} rows`} · ${ms}ms — ${oneLine(stmt)}`,
      );
      if (/^\s*(create|drop|alter|rename)\b/i.test(stmt)) void loadSchema();
      if (knownMeta === undefined) {
        void detectEditMeta(stmt, res).then((meta) => {
          if (meta) setQ(id, { editMeta: meta });
        });
      }
      return true;
    } catch (e) {
      if (isCancelled(token)) return false;
      const ms = Math.round(performance.now() - t0);
      setError(String(e));
      logLine("ERR", `${String(e)} · ${ms}ms — ${oneLine(stmt)}`);
      setHistory(
        pushHistory(connection.id, {
          sql: stmt,
          ok: false,
          durationMs: ms,
          message: String(e).slice(0, 120),
        }),
      );
      return false;
    } finally {
      if (!isCancelled(token)) {
        setBusy(false);
        setBusyAction(null);
      }
    }
  }

  /** Statement to run from the editor: selection, else statement at cursor. */
  function editorStatement(): string {
    const view = editorRef.current;
    if (!view) return "";
    const sel = view.state.selection.main;
    return sqlToExecute(
      view.state.doc.toString(),
      view.state.sliceDoc(sel.from, sel.to),
      sel.head,
    );
  }

  async function runSql() {
    const id = ownerRef.current;
    if (!id) return;
    const stmt = editorStatement();
    if (!stmt.trim()) {
      setStatus("Nothing to run");
      return;
    }
    if (!(await confirmDestructive([stmt]))) return;
    await execute(id, stmt);
  }

  /** Run every statement in the selection (or whole editor), continuing on errors. */
  async function runScript() {
    const id = ownerRef.current;
    const view = editorRef.current;
    if (!id || !view || busy) return;
    const sel = view.state.selection.main;
    const text = sel.empty
      ? view.state.doc.toString()
      : view.state.sliceDoc(sel.from, sel.to);
    const stmts = splitStatements(text).filter((st) =>
      /\S/.test(
        st.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, ""),
      ),
    );
    if (!stmts.length) {
      setStatus("Nothing to run");
      return;
    }
    if (!(await confirmDestructive(stmts))) return;
    const token = ++runSeq.current;
    setBusy(true);
    setBusyAction("script");
    setError("");
    setStatus("");
    const t0 = performance.now();
    const results: StatementResult[] = [];
    let schemaChanged = false;
    for (let i = 0; i < stmts.length; i++) {
      setStatus(`Running statement ${i + 1}/${stmts.length}…`);
      const st0 = performance.now();
      try {
        const res = await invoke<QueryResult>("run_sql", { sql: stmts[i] });
        if (isCancelled(token)) break;
        const ms = Math.round(performance.now() - st0);
        results.push({ sql: stmts[i], ok: true, result: res, durationMs: ms });
        setHistory(
          pushHistory(connection.id, {
            sql: stmts[i],
            ok: true,
            durationMs: ms,
            message:
              res.rowsAffected != null
                ? `${res.rowsAffected} affected`
                : `${res.rows.length} rows`,
          }),
        );
        if (/^\s*(create|drop|alter|rename)\b/i.test(stmts[i])) schemaChanged = true;
      } catch (e) {
        if (isCancelled(token)) break;
        const ms = Math.round(performance.now() - st0);
        results.push({
          sql: stmts[i],
          ok: false,
          error: String(e),
          durationMs: ms,
        });
        setHistory(
          pushHistory(connection.id, {
            sql: stmts[i],
            ok: false,
            durationMs: ms,
            message: String(e).slice(0, 120),
          }),
        );
      }
    }
    const stopped = isCancelled(token);
    if (results.length) {
      const firstBad = results.findIndex((r) => !r.ok);
      setQ(id, {
        result: null,
        explainResult: null,
        script: results,
        scriptIdx: firstBad >= 0 ? firstBad : 0,
        lastSql: text,
        durationMs: Math.round(performance.now() - t0),
        editMeta: null,
      });
    }
    if (!stopped) {
      const bad = results.filter((r) => !r.ok).length;
      const summary = `Script: ${results.length - bad} ok, ${bad} failed · ${Math.round(performance.now() - t0)}ms`;
      setStatus(summary);
      for (const r of results.filter((x) => !x.ok))
        logLine("ERR", `${r.error ?? ""} — ${oneLine(r.sql)}`);
      logLine(bad ? "ERR" : "OK", summary);
      setBusy(false);
      setBusyAction(null);
    }
    if (schemaChanged) void loadSchema();
  }

  /** Transaction toolbar: BEGIN / COMMIT / ROLLBACK on the shared live connection. */
  async function runTx(kind: "begin" | "commit" | "rollback") {
    if (busy) return;
    const stmt =
      kind === "begin"
        ? engine === "mssql"
          ? "BEGIN TRAN"
          : "BEGIN"
        : kind.toUpperCase();
    const ok = await execute(ownerRef.current ?? targetSqlId(), stmt);
    if (ok) {
      setTxActive(kind === "begin");
      setStatus(
        kind === "begin"
          ? "Transaction started — Commit or Rollback when done"
          : kind === "commit"
            ? "Transaction committed"
            : "Transaction rolled back",
      );
    }
  }

  async function explainSql() {
    const id = ownerRef.current;
    if (!id) return;
    const stmt = editorStatement();
    if (!stmt.trim()) {
      setStatus("Nothing to explain");
      return;
    }
    const qs = queries[id] ?? EMPTY_Q;
    const token = ++runSeq.current;
    setBusy(true);
    setBusyAction("explain");
    setError("");
    setStatus("");
    const t0 = performance.now();
    try {
      const useAnalyze = qs.analyzeExplain && isReadSql(stmt);
      if (qs.analyzeExplain && !useAnalyze) {
        setStatus("Analyze only applies to SELECT / WITH / VALUES — using EXPLAIN");
      }
      const res = await invoke<QueryResult>("run_sql", {
        sql: buildExplainSql(engine, stmt, useAnalyze),
      });
      if (isCancelled(token)) return;
      const ms = Math.round(performance.now() - t0);
      setQ(id, {
        result: null,
        script: null,
        scriptIdx: 0,
        explainResult: res,
        prevExplainResult: qs.explainResult ?? qs.prevExplainResult,
        explainView: "table",
        lastSql: stmt,
        durationMs: ms,
        editMeta: null,
      });
      setHistory(
        pushHistory(connection.id, {
          sql: stmt,
          ok: true,
          durationMs: ms,
          message: `Explain${useAnalyze ? " Analyze" : ""} · ${res.rows.length} step(s)`,
        }),
      );
      setStatus(
        `Explain${useAnalyze ? " Analyze" : ""} · ${res.rows.length} step(s)`,
      );
      logLine(
        "OK",
        `Explain${useAnalyze ? " Analyze" : ""} · ${res.rows.length} step(s) · ${ms}ms — ${oneLine(stmt)}`,
      );
    } catch (e) {
      if (isCancelled(token)) return;
      setError(String(e));
      logLine("ERR", `Explain: ${String(e)} — ${oneLine(stmt)}`);
      setHistory(
        pushHistory(connection.id, {
          sql: stmt,
          ok: false,
          durationMs: Math.round(performance.now() - t0),
          message: `Explain: ${String(e).slice(0, 100)}`,
        }),
      );
    } finally {
      if (!isCancelled(token)) {
        setBusy(false);
        setBusyAction(null);
      }
    }
  }

  function formatEditor() {
    const id = targetSqlId();
    focusSql(id);
    const view = editorRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    try {
      if (!sel.empty) {
        view.dispatch({
          changes: {
            from: sel.from,
            to: sel.to,
            insert: formatSql(view.state.sliceDoc(sel.from, sel.to)),
          },
        });
      } else {
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: formatSql(view.state.doc.toString()),
          },
        });
      }
    } catch (e) {
      setError(`Format failed: ${String(e)}`);
    }
  }

  // ---- files / export -------------------------------------------------

  async function openSqlFile() {
    const path = await open({
      multiple: false,
      filters: [{ name: "SQL", extensions: ["sql", "txt"] }],
    });
    if (typeof path !== "string") return;
    try {
      const text = await invoke<string>("read_text_file", { path });
      const id = targetSqlId();
      setEditorSql(text);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id && t.kind === "sql"
            ? { ...t, filePath: path, label: baseName(path) }
            : t,
        ),
      );
      setStatus(`Opened ${path}`);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveSqlFile(saveAs: boolean) {
    const id = targetSqlId();
    const tab = tabs.find((t) => t.id === id);
    if (tab?.kind !== "sql") return;
    focusSql(id);
    const view = editorRef.current;
    if (!view) return;
    let path = saveAs ? null : (tab.filePath ?? null);
    if (!path) {
      path = await save({
        defaultPath: tab.filePath ?? `${tab.label.replace(/\s+/g, "-")}.sql`,
        filters: [{ name: "SQL", extensions: ["sql"] }],
      });
    }
    if (!path) return;
    try {
      await invoke("write_text_file", {
        path,
        contents: view.state.doc.toString(),
      });
      const saved = path;
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id && t.kind === "sql"
            ? { ...t, filePath: saved, label: baseName(saved) }
            : t,
        ),
      );
      setStatus(`Saved ${saved}`);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  /** Result the export / copy helpers should use, plus names for file / INSERTs. */
  function currentResultInfo(): {
    res: QueryResult | null;
    name: string;
    table: string;
  } {
    if (activeTab?.kind === "data") {
      return {
        res: dataResult,
        name: shortTable(activeTab.table),
        table: activeTab.table,
      };
    }
    const qs = queries[targetSqlId()];
    const res =
      qs?.explainResult ??
      (qs?.script ? (qs.script[qs.scriptIdx]?.result ?? null) : qs?.result) ??
      null;
    return { res, name: "query", table: qs?.editMeta?.table ?? "table_name" };
  }

  async function exportQueryAs(fmt: ExportFormat) {
    const { res, name, table } = currentResultInfo();
    if (!res || !res.columns.length) {
      setError("No result to export — run a query first");
      return;
    }
    const f = EXPORT_FORMATS.find((x) => x.id === fmt)!;
    const path = await save({
      defaultPath: `${name}.${f.ext}`,
      filters: [{ name: f.label, extensions: [f.ext] }],
    });
    if (!path) return;
    try {
      await invoke("write_text_file", {
        path,
        contents: formatResult(fmt, res, table, engine, csvFromResult),
      });
      setError("");
      setStatus(`Exported result ${f.label} → ${path}`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function copyQueryAs(fmt: ExportFormat) {
    const { res, table } = currentResultInfo();
    if (!res || !res.columns.length) {
      setError("No result to copy — run a query first");
      return;
    }
    try {
      await copyText(formatResult(fmt, res, table, engine, csvFromResult));
      setError("");
      setStatus(`Copied result as ${fmt}`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function exportQueryCsv() {
    await exportQueryAs("csv");
  }

  async function exportCsv(filteredExport: boolean) {
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
        filters: filteredExport ? tab.filters : [],
        sort: filteredExport ? tab.sort : null,
      });
      await invoke("write_text_file", { path, contents: csv });
      setStatus(
        filteredExport
          ? `Exported filtered CSV → ${path}`
          : `Exported table CSV → ${path}`,
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
    if (mode === "replace") {
      if (!connection.permissions.allowDelete) {
        setError("DELETE is disabled for this connection (needed for replace)");
        return;
      }
      if (
        !(await askNative(
          `Replace ALL rows in ${tab.table} with the CSV contents?`,
          "Import CSV (replace)",
        ))
      ) {
        return;
      }
    }
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

  async function importJson() {
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind !== "data") return;
    if (!connection.permissions.allowInsert) {
      setError("INSERT is disabled for this connection");
      return;
    }
    const path = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof path !== "string") return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const text = await invoke<string>("read_text_file", { path });
      const cols = (details?.columns ?? (await fetchDetails(tab.table)).columns).map(
        (c) => c.name,
      );
      const r = jsonToInserts(tab.table, text, engine, cols);
      for (const stmt of r.statements) {
        await invoke("run_sql", { sql: stmt });
      }
      setStatus(
        `Imported ${r.rows} row(s) from JSON` +
          (r.ignoredKeys.length ? ` (ignored keys: ${r.ignoredKeys.join(", ")})` : ""),
      );
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
      await loadSchema();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function copyViewToSql() {
    const tab = tabs.find((t) => t.id === active);
    if (tab?.kind !== "data") return;
    const stmt = buildViewSql(tab.table, tab.filters, tab.sort, tab.offset);
    setError("");
    setEditorSql(stmt);
    setStatus("Opened current table view in SQL editor");
  }

  // ---- tabs -------------------------------------------------------------

  function cleanupSqlTab(id: string) {
    delete sqlRef.current[id];
    if (ownerRef.current === id) ownerRef.current = null;
    setQueries((prev) => {
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  }

  function removeTabs(ids: string[], focusId?: string) {
    if (!ids.length) return;
    const doomed = new Set(ids);
    const sqlTabs = tabs.filter((t) => t.kind === "sql");
    const remainingSql = sqlTabs.filter((t) => !doomed.has(t.id));
    if (remainingSql.length === 0 && sqlTabs[0]) {
      doomed.delete(sqlTabs[0].id);
      if (doomed.size === 0) {
        setStatus("Keep at least one query tab open");
        return;
      }
    }
    const activeIdx = tabs.findIndex((t) => t.id === active);
    const next = tabs.filter((t) => !doomed.has(t.id));
    for (const t of tabs) {
      if (doomed.has(t.id) && t.kind === "sql") cleanupSqlTab(t.id);
    }
    setTabs(next);
    if (focusId && next.some((t) => t.id === focusId)) {
      setActive(focusId);
    } else if (doomed.has(active)) {
      const neighbour = next[Math.min(activeIdx, next.length - 1)] ?? next[0];
      if (neighbour) setActive(neighbour.id);
    }
  }

  function closeTab(id: string) {
    removeTabs([id]);
  }

  function closeOtherTabs(keepId: string) {
    removeTabs(
      tabs.filter((t) => t.id !== keepId).map((t) => t.id),
      keepId,
    );
  }

  function closeAllTabs() {
    const firstSql = tabs.find((t) => t.kind === "sql");
    removeTabs(
      tabs.filter((t) => t.id !== firstSql?.id).map((t) => t.id),
      firstSql?.id,
    );
  }

  function closeTabsForTables(tables: string[]) {
    const doomed = new Set(
      tabs
        .filter(
          (t) =>
            (t.kind === "data" ||
              t.kind === "structure" ||
              (t.kind === "tableEdit" && t.mode === "alter")) &&
            tables.includes(t.table),
        )
        .map((t) => t.id),
    );
    if (!doomed.size) return;
    const remaining = tabs.filter((t) => !doomed.has(t.id));
    setTabs(remaining);
    if (doomed.has(active)) {
      const firstSql = remaining.find((t) => t.kind === "sql");
      if (firstSql) focusSql(firstSql.id);
    }
  }

  function setStructSection(section: StructSection) {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === active && t.kind === "structure" ? { ...t, section } : t,
      ),
    );
  }

  // ---- history / snippets ----------------------------------------------

  function insertAtCursor(text: string) {
    focusSql(targetSqlId());
    const view = editorRef.current;
    if (!view) return;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
  }

  function insertSnippet(body: string) {
    const table = selectedTable ?? activeTableName ?? "table_name";
    insertAtCursor(body.replace(/\$\{table\}/g, table));
  }

  function currentDraftSql() {
    return editorRef.current?.state.doc.toString() ?? "";
  }

  // ---- schema tree actions ---------------------------------------------

  function ddlGuard(action: string): boolean {
    if (!connection.permissions.allowDdl) {
      setError(`${action} is disabled for this connection (DDL not allowed)`);
      return false;
    }
    return true;
  }

  function closeTabsForTable(table: string) {
    closeTabsForTables([table]);
  }

  function askDrop(table: string) {
    if (!ddlGuard("Drop")) return;
    const isView = tableKinds[table] === "view";
    setConfirm({
      title: `Drop ${isView ? "view" : "table"} ${shortTable(table)}?`,
      description:
        "This permanently removes the object and its data. It cannot be undone.",
      confirmLabel: "Drop",
      run: async () => {
        await invoke("run_sql", {
          sql: `DROP ${isView ? "VIEW" : "TABLE"} ${quoteIdent(table)}`,
        });
        closeTabsForTable(table);
        setStatus(`Dropped ${table}`);
        await loadSchema();
      },
    });
  }

  function askTruncate(table: string) {
    if (!ddlGuard("Truncate")) return;
    setConfirm({
      title: `Truncate ${shortTable(table)}?`,
      description: "All rows will be deleted. It cannot be undone.",
      confirmLabel: "Truncate",
      run: async () => {
        const stmt =
          engine === "sqlite"
            ? `DELETE FROM ${quoteIdent(table)}`
            : `TRUNCATE TABLE ${quoteIdent(table)}`;
        await invoke("run_sql", { sql: stmt });
        setStatus(`Truncated ${table}`);
        const tab = tabs.find((t) => t.id === `data:${table}`);
        if (tab?.kind === "data" && active === tab.id) {
          await loadTable(tab.table, 0, tab.filters, tab.sort);
        }
      },
    });
  }

  function askRenameTable(table: string) {
    if (!ddlGuard("Rename table")) return;
    setPrompt({
      title: `Rename ${shortTable(table)}`,
      label: "New name",
      initial: shortTable(table),
      confirmLabel: "Rename",
      onSubmit: async (name) => {
        if (name === shortTable(table)) return;
        setBusy(true);
        setError("");
        try {
          await invoke("run_sql", { sql: renameTableSql(engine, table, name) });
          closeTabsForTable(table);
          setSelectedTable(renamedRef(table, name));
          setColumnsCache((prev) => {
            const { [table]: _drop, ...rest } = prev;
            return rest;
          });
          setStatus(`Renamed ${table} → ${name}`);
          await loadSchema();
        } catch (e) {
          setError(String(e));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  async function openTableEditor(table: string) {
    const id = `tableedit:${table}`;
    if (tabs.some((t) => t.id === id)) {
      setActive(id);
      return;
    }
    try {
      const d = await fetchDetails(table);
      const cols = columnsToEditable(d.columns);
      const idx = indexesToEditable(d.indexes);
      const fks = fksToEditable(d.foreignKeys);
      setTabs((prev) =>
        prev.some((t) => t.id === id)
          ? prev
          : [
              ...prev,
              {
                kind: "tableEdit",
                id,
                table,
                mode: "alter",
                columns: cols,
                originalColumns: cols.map((c) => ({ ...c })),
                indexes: idx,
                originalIndexes: idx.map((i) => ({ ...i })),
                fks,
                originalFks: fks.map((f) => ({ ...f })),
              },
            ],
      );
      setSelectedTable(table);
      setActive(id);
    } catch (e) {
      setError(String(e));
    }
  }

  async function openViewEditor(ref: string) {
    const id = `viewedit:${ref}`;
    if (tabs.some((t) => t.id === id)) {
      setActive(id);
      return;
    }
    try {
      const res = await invoke<QueryResult>("run_sql", {
        sql: viewDefinitionSql(engine, ref),
      });
      const body = extractViewBody(String(res.rows[0]?.[0] ?? ""));
      setTabs((prev) =>
        prev.some((t) => t.id === id)
          ? prev
          : [...prev, { kind: "viewEdit", id, name: ref, body, mode: "alter" }],
      );
      setActive(id);
    } catch (e) {
      setError(String(e));
    }
  }

  async function exportTableToFile(table: string) {
    const path = await save({
      defaultPath: `${shortTable(table)}.sql`,
      filters: [{ name: "SQL", extensions: ["sql"] }],
    });
    if (!path) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const sqlDump = await invoke<string>("export_table_sql", {
        table,
        includeSchema: true,
        includeData: true,
      });
      await invoke("write_text_file", { path, contents: sqlDump });
      setStatus(`Exported ${table} → ${path}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importCsvIntoTable(table: string) {
    if (!connection.permissions.allowInsert) {
      setError("INSERT is disabled for this connection");
      return;
    }
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
        table,
        csv,
        mode: "append",
      });
      setStatus(`Imported ${n} row(s) into ${table}`);
      const tab = tabs.find((t) => t.id === `data:${table}`);
      if (tab?.kind === "data" && active === tab.id) {
        await loadTable(tab.table, tab.offset, tab.filters, tab.sort);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function sqlCreateInTab(table: string) {
    try {
      const ddl = await invoke<string>("export_table_sql", {
        table,
        includeSchema: true,
        includeData: false,
      });
      newQueryTab(ddl.trim() || `-- no CREATE for ${table}`);
    } catch (e) {
      setError(String(e));
    }
  }

  function sqlSelectTop(table: string) {
    newQueryTab(selectTopSql(engine, quoteIdent(table)));
  }

  function hideTable(table: string) {
    setHiddenTables((prev) => new Set(prev).add(table));
    if (selectedTable === table) setSelectedTable(null);
    setStatus(`Hidden ${shortTable(table)}`);
  }

  function showAllHidden() {
    const n = hiddenTables.size;
    setHiddenTables(new Set());
    if (n) setStatus(`Showed ${n} hidden object(s)`);
  }

  function askDuplicateTable(table: string) {
    if (!ddlGuard("Duplicate table")) return;
    if (tableKinds[table] === "view") {
      setError("Duplicate is only available for tables");
      return;
    }
    setPrompt({
      title: `Duplicate ${shortTable(table)}`,
      label: "New table name",
      initial: `${shortTable(table)}_copy`,
      confirmLabel: "Duplicate",
      onSubmit: async (name) => {
        const bare = name.trim();
        if (!bare || bare === shortTable(table)) return;
        const dest = qualifySibling(engine, table, bare);
        setBusy(true);
        setError("");
        try {
          const sql = duplicateTableSql(
            engine,
            quoteIdent(table),
            quoteIdent(dest),
          );
          await invoke("run_sql", { sql });
          setStatus(`Duplicated ${table} → ${dest}`);
          await loadSchema();
          openData(dest);
        } catch (e) {
          setError(String(e));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  async function runConfirm() {
    const c = confirm;
    if (!c) return;
    setConfirm(null);
    setBusy(true);
    setError("");
    try {
      await c.run();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reconnect() {
    setBusy(true);
    setError("");
    setStatus("Reconnecting…");
    setTxActive(false);
    try {
      try {
        await invoke("close_connection");
      } catch {
        // already closed
      }
      await invoke("open_connection", { id: connection.id });
      setColumnsCache({});
      await loadSchema();
      const tab = tabs.find((t) => t.id === active);
      if (tab?.kind === "data") {
        await loadTable(tab.table, tab.offset, tab.filters, tab.sort);
        await loadDetails(tab.table);
      } else if (tab?.kind === "structure") {
        await loadDetails(tab.table);
      }
      setStatus("Reconnected");
    } catch (e) {
      setStatus("");
      setError(`Reconnect failed: ${String(e)}`);
      logError(`reconnect failed engine=${engine}`);
    } finally {
      setBusy(false);
    }
  }

  // ---- table editor ------------------------------------------------------

  function openNewTable(templateCols?: EditableColumn[]) {
    if (!ddlGuard("Create table")) return;
    const id = `tableedit:new-${++newTableCounter.current}`;
    const cols = templateCols ?? defaultNewTableColumns(engine);
    setTabs((prev) => [
      ...prev,
      {
        kind: "tableEdit",
        id,
        table: "",
        mode: "create",
        columns: cols,
        originalColumns: [],
        indexes: [],
        originalIndexes: [],
        fks: [],
        originalFks: [],
      },
    ]);
    setActive(id);
  }

  function patchTableEdit(id: string, patch: Partial<TableEditTab>) {
    setTabs((prev) =>
      prev.map((t) => (t.id === id && t.kind === "tableEdit" ? { ...t, ...patch } : t)),
    );
  }

  function tableEditDdl(tab: TableEditTab): string {
    try {
      const base = tab.mode === "create"
        ? buildCreateTableSql(
            engine,
            tab.table.trim() || "table_name",
            tab.columns,
            tab.fks,
            tab.indexes,
          )
        : buildAlterSql(
            engine,
            tab.table,
            {
              columns: tab.originalColumns,
              indexes: tab.originalIndexes,
              fks: tab.originalFks,
            },
            { columns: tab.columns, indexes: tab.indexes, fks: tab.fks },
          );
      return applyAdvancedOptions(
        engine,
        tab.mode,
        tab.table.trim() || "table_name",
        base,
        tab.advanced,
      );
    } catch (e) {
      return `-- ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function applyTableEdit(tab: TableEditTab) {
    if (!ddlGuard("Apply table changes")) return;
    if (tab.mode === "create" && !tab.table.trim()) {
      setError("Enter a table name");
      return;
    }
    const ddl = tableEditDdl(tab);
    if (!hasExecutableSql(ddl)) {
      setError("Nothing to apply");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await invoke("run_sql_script", { sql: stripCommentLines(ddl) });
      const name = tab.table.trim();
      setColumnsCache((prev) => {
        const { [name]: _drop, ...rest } = prev;
        return rest;
      });
      // Reload from the server so renamed columns / generated names are exact.
      const d = await fetchDetails(name);
      const cols = columnsToEditable(d.columns);
      const idx = indexesToEditable(d.indexes);
      const fks = fksToEditable(d.foreignKeys);
      const fresh: Partial<TableEditTab> = {
        columns: cols,
        originalColumns: cols.map((c) => ({ ...c })),
        indexes: idx,
        originalIndexes: idx.map((i) => ({ ...i })),
        fks,
        originalFks: fks.map((f) => ({ ...f })),
        advanced: EMPTY_ADVANCED, // options were just applied
      };
      if (tab.mode === "create") {
        const newId = `tableedit:${name}`;
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tab.id
              ? {
                  ...tab,
                  ...fresh,
                  id: newId,
                  table: name,
                  mode: "alter" as const,
                }
              : t,
          ),
        );
        setActive(newId);
        setStatus(`Created table ${name}`);
      } else {
        patchTableEdit(tab.id, fresh);
        setStatus(`Updated table ${tab.table}`);
      }
      await loadSchema();
    } catch (e) {
      setError(String(e));
      void loadSchema();
    } finally {
      setBusy(false);
    }
  }

  // ---- view editor ---------------------------------------------------------

  function openNewView() {
    if (!ddlGuard("Create view")) return;
    const id = `viewedit:new-${++newTableCounter.current}`;
    setTabs((prev) => [
      ...prev,
      {
        kind: "viewEdit",
        id,
        name: "",
        body: "SELECT * FROM table_name",
        mode: "create",
      },
    ]);
    setActive(id);
  }

  function patchViewEdit(id: string, patch: Partial<ViewEditTab>) {
    setTabs((prev) =>
      prev.map((t) => (t.id === id && t.kind === "viewEdit" ? { ...t, ...patch } : t)),
    );
  }

  function viewEditDdl(tab: ViewEditTab): string {
    return buildViewDdl(engine, tab.name.trim() || "view_name", tab.body, tab.mode);
  }

  async function applyViewEdit(tab: ViewEditTab) {
    if (!ddlGuard("Apply view")) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await invoke("run_sql_script", { sql: viewEditDdl(tab) });
      const name = tab.name.trim();
      if (tab.mode === "create") {
        const newId = `viewedit:${name}`;
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tab.id
              ? { ...tab, id: newId, name, mode: "alter" as const }
              : t,
          ),
        );
        setActive(newId);
        setStatus(`Created view ${name}`);
      } else {
        setStatus(`Updated view ${name}`);
      }
      setColumnsCache((prev) => {
        const { [name]: _drop, ...rest } = prev;
        return rest;
      });
      await loadSchema();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- routine editor (MySQL / MariaDB) ---------------------------------------

  function openNewRoutine(kind: RoutineKind = "procedure") {
    if (!ddlGuard("Create routine")) return;
    const id = `routine:new-${++newTableCounter.current}`;
    setTabs((prev) => [
      ...prev,
      {
        kind: "routine",
        id,
        name: "",
        routineKind: kind,
        body: routineTemplate(kind),
        mode: "create",
      },
    ]);
    setActive(id);
  }

  async function openRoutineEditor(r: RoutineInfo) {
    const ref = `${r.schema}.${r.name}`;
    const id = `routine:${ref}:${r.kind}`;
    if (tabs.some((t) => t.id === id)) {
      setActive(id);
      return;
    }
    try {
      const res = await invoke<QueryResult>("run_sql", {
        sql: showCreateRoutineSql(engine, r.kind, ref),
      });
      const body = extractRoutineBody(String(res.rows[0]?.[2] ?? ""));
      setTabs((prev) =>
        prev.some((t) => t.id === id)
          ? prev
          : [
              ...prev,
              {
                kind: "routine",
                id,
                name: ref,
                routineKind: r.kind,
                body,
                mode: "alter",
              },
            ],
      );
      setActive(id);
    } catch (e) {
      setError(String(e));
    }
  }

  function patchRoutine(id: string, patch: Partial<RoutineTab>) {
    setTabs((prev) =>
      prev.map((t) => (t.id === id && t.kind === "routine" ? { ...t, ...patch } : t)),
    );
  }

  function routineDdl(tab: RoutineTab): string {
    return buildRoutineStatements(
      engine,
      tab.name.trim() || "routine_name",
      tab.routineKind,
      tab.body,
      tab.mode,
    )
      .map((x) => `${x};`)
      .join("\n");
  }

  async function applyRoutine(tab: RoutineTab) {
    if (!ddlGuard("Apply routine")) return;
    if (!isMysqlLike(engine)) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      // One run_sql per statement: bodies contain `;` inside BEGIN … END.
      for (const stmt of buildRoutineStatements(
        engine,
        tab.name.trim(),
        tab.routineKind,
        tab.body,
        tab.mode,
      )) {
        await invoke("run_sql", { sql: stmt });
      }
      const name = tab.name.trim();
      if (tab.mode === "create") {
        const newId = `routine:${name}:${tab.routineKind}`;
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tab.id
              ? { ...tab, id: newId, name, mode: "alter" as const }
              : t,
          ),
        );
        setActive(newId);
      }
      setStatus(`Saved ${tab.routineKind} ${name}`);
      await loadRoutines();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- schemas, rename, inspector, search, dump ---------------------------------

  async function runDdl(stmt: string, okMessage: string) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await invoke("run_sql", { sql: stmt });
      setStatus(okMessage);
      await loadSchema();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function askNewSchema() {
    if (!ddlGuard("Create schema")) return;
    if (engine === "sqlite") {
      setStatus("SQLite has a single schema — attach another file with ATTACH in a Query tab");
      return;
    }
    setPrompt({
      title: isMysqlLike(engine) ? "New database" : "New schema",
      label: "Name",
      confirmLabel: "Create",
      onSubmit: (name) => {
        const stmt = createSchemaSql(engine, name);
        if (stmt) void runDdl(stmt, `Created ${name}`);
      },
    });
  }

  function askDropSchema(name: string) {
    if (!ddlGuard("Drop schema")) return;
    const stmt = dropSchemaSql(engine, name);
    if (!stmt) return;
    setConfirm({
      title: `Drop ${isMysqlLike(engine) ? "database" : "schema"} ${name}?`,
      description:
        "Everything inside it is removed. Other engines refuse to drop a non-empty schema." +
        " It cannot be undone.",
      confirmLabel: "Drop",
      run: async () => {
        await invoke("run_sql", { sql: stmt });
        const node = schema.find((x) => x.name === name);
        if (node) {
          closeTabsForTables(
            node.children.map((c) => tableRef(name, c.name, engine)),
          );
        }
        setStatus(`Dropped ${name}`);
        await loadSchema();
      },
    });
  }

  async function inspectTable(table?: string) {
    const t = table ?? selectedTable ?? activeTableName;
    if (!t) {
      setStatus("Select a table first");
      return;
    }
    const kind = tableKinds[t] ?? "table";
    const node = schema.find((x) =>
      x.children.some((c) => tableRef(x.name, c.name, engine) === t),
    );
    const schemaSummary = node
      ? `${node.name}: ${node.children.filter((c) => c.kind !== "view").length} tables, ${node.children.filter((c) => c.kind === "view").length} views`
      : "";
    const patch = (p: Partial<InspectorData>) =>
      setInspector((cur) => (cur && cur.table === t ? { ...cur, ...p } : cur));
    setInspector({
      table: t,
      kind,
      loading: true,
      rowCount: null,
      columnCount: null,
      indexCount: null,
      fkCount: null,
      createSql: "",
      schemaSummary,
    });
    try {
      const d = await fetchDetails(t);
      patch({
        columnCount: d.columns.length,
        indexCount: d.indexes.length,
        fkCount: d.foreignKeys.length,
      });
    } catch (e) {
      patch({ error: String(e) });
    }
    try {
      if (kind === "view") {
        const res = await invoke<QueryResult>("run_sql", {
          sql: viewDefinitionSql(engine, t),
        });
        patch({
          createSql: buildViewDdl(
            engine,
            t,
            extractViewBody(String(res.rows[0]?.[0] ?? "")),
            "create",
          ),
        });
      } else {
        patch({
          createSql: await invoke<string>("export_table_sql", {
            table: t,
            includeSchema: true,
            includeData: false,
          }),
        });
      }
    } catch (e) {
      patch({ error: String(e) });
    }
    try {
      const res = await invoke<QueryResult>("run_sql", {
        sql: `SELECT COUNT(*) FROM ${quoteIdent(t)}`,
      });
      patch({ rowCount: Number(res.rows[0]?.[0] ?? 0) });
    } catch {
      // count is optional
    }
    patch({ loading: false });
  }

  /** Global data search: LIKE over the first text columns of up to 20 tables. */
  async function globalSearch(
    text: string,
    hooks: {
      onHit: (hit: SearchHit) => void;
      onProgress: (msg: string) => void;
      cancelled: () => boolean;
    },
  ) {
    const tables = schema
      .flatMap((sc) =>
        sc.children
          .filter((c) => c.kind !== "view")
          .map((c) => tableRef(sc.name, c.name, engine)),
      )
      .slice(0, 20);
    const pattern = `%${text}%`;
    let found = 0;
    for (let i = 0; i < tables.length; i++) {
      if (hooks.cancelled()) return;
      const t = tables[i];
      hooks.onProgress(`Searching ${t} (${i + 1}/${tables.length})…`);
      try {
        const d = await fetchDetails(t);
        const cols = d.columns
          .filter((c) => isSearchableType(c.dataType))
          .slice(0, 4)
          .map((c) => c.name);
        if (!cols.length) continue;
        const where = cols
          .map((c) => `${quoteIdent(c)} LIKE ${sqlLiteral(pattern)}`)
          .join(" OR ");
        const res = await invoke<QueryResult>("run_sql", {
          sql:
            engine === "mssql"
              ? `SELECT TOP 5 * FROM ${quoteIdent(t)} WHERE ${where}`
              : `SELECT * FROM ${quoteIdent(t)} WHERE ${where} LIMIT 5`,
        });
        if (hooks.cancelled()) return;
        if (res.rows.length) {
          found++;
          hooks.onHit({
            table: t,
            columns: cols,
            rows: res.rows,
            resultColumns: res.columns,
          });
        }
      } catch {
        // skip tables that can't be searched
      }
    }
    hooks.onProgress(
      `Done — ${found} table(s) with hits (${tables.length} searched)`,
    );
  }

  /** Dump every table (not views) into one .sql file. */
  async function dumpSchema(includeData: boolean) {
    const tables = schema.flatMap((sc) =>
      sc.children
        .filter((c) => c.kind !== "view")
        .map((c) => tableRef(sc.name, c.name, engine)),
    );
    if (!tables.length) {
      setStatus("No tables to dump");
      return;
    }
    const path = await save({
      defaultPath: `${connection.name.replace(/\s+/g, "-")}-${includeData ? "dump" : "schema"}.sql`,
      filters: [{ name: "SQL", extensions: ["sql"] }],
    });
    if (!path) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const mysql = isMysqlLike(engine);
      const parts: string[] = [
        `-- re-dbviewer dump of ${connection.name} (${engine})${includeData ? " with data" : " schema only"}\n`,
      ];
      if (mysql) parts.push("SET FOREIGN_KEY_CHECKS=0;\n");
      let failed = 0;
      for (let i = 0; i < tables.length; i++) {
        setStatus(`Dumping ${tables[i]} (${i + 1}/${tables.length})…`);
        try {
          const dump = await invoke<string>("export_table_sql", {
            table: tables[i],
            includeSchema: true,
            includeData,
          });
          parts.push(`-- Table ${tables[i]}\n${dump}\n`);
        } catch (e) {
          failed++;
          parts.push(`-- FAILED ${tables[i]}: ${String(e).replace(/\n/g, " ")}\n`);
        }
      }
      if (mysql) parts.push("SET FOREIGN_KEY_CHECKS=1;\n");
      await invoke("write_text_file", { path, contents: parts.join("\n") });
      setStatus(
        `Dumped ${tables.length - failed}/${tables.length} table(s) → ${path}`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- menu actions + shortcuts ------------------------------------------

  useEffect(() => {
    actionsRef.current = {
      newQueryTab: () => newQueryTab(),
      closeActiveTab: () => closeTab(active),
      openSqlFile: () => void openSqlFile(),
      saveSqlFile: () => void saveSqlFile(false),
      saveSqlFileAs: () => void saveSqlFile(true),
      formatSql: formatEditor,
      toggleHistory: () => setHistoryOpen((v) => !v),
      toggleSnippets: () => {
        const id = targetSqlId();
        focusSql(id);
        setSnippetsOpen((v) => !v);
      },
      reconnect: () => void reconnect(),
      exportQueryCsv: () => void exportQueryCsv(),
      runScript: () => void runScript(),
      stopQuery: stopRun,
      beginTx: () => void runTx("begin"),
      commitTx: () => void runTx("commit"),
      rollbackTx: () => void runTx("rollback"),
      toggleHelp: () => {
        focusSql(targetSqlId());
        setHelpOpen((v) => !v);
      },
      globalSearch: () => setSearchOpen(true),
      inspectTable: () => void inspectTable(),
      dumpSchema: (includeData = true) => void dumpSchema(includeData),
      restoreSql: () => void importSqlFile(),
      schemaInspector: () => setSchemaInspectOpen(true),
      dumpTables: () => setDumpOpen(true),
      openServerAdmin: () => {
        if (!adminSupported(engine)) {
          setStatus("Administration is available for MySQL, MariaDB, and PostgreSQL");
          return;
        }
        setAdminView(DEFAULT_ADMIN_VIEW);
        setWorkspaceMode("admin");
      },
      openSqlInTab: (sql: string) => void newQueryTab(sql),
    };
  });

  useEffect(() => {
    const stable: WorkspaceActions = {
      newQueryTab: () => actionsRef.current?.newQueryTab(),
      closeActiveTab: () => actionsRef.current?.closeActiveTab(),
      openSqlFile: () => actionsRef.current?.openSqlFile(),
      saveSqlFile: () => actionsRef.current?.saveSqlFile(),
      saveSqlFileAs: () => actionsRef.current?.saveSqlFileAs(),
      formatSql: () => actionsRef.current?.formatSql(),
      toggleHistory: () => actionsRef.current?.toggleHistory(),
      toggleSnippets: () => actionsRef.current?.toggleSnippets(),
      reconnect: () => actionsRef.current?.reconnect(),
      exportQueryCsv: () => actionsRef.current?.exportQueryCsv(),
      runScript: () => actionsRef.current?.runScript(),
      stopQuery: () => actionsRef.current?.stopQuery(),
      beginTx: () => actionsRef.current?.beginTx(),
      commitTx: () => actionsRef.current?.commitTx(),
      rollbackTx: () => actionsRef.current?.rollbackTx(),
      toggleHelp: () => actionsRef.current?.toggleHelp(),
      globalSearch: () => actionsRef.current?.globalSearch(),
      inspectTable: () => actionsRef.current?.inspectTable(),
      dumpSchema: (includeData) => actionsRef.current?.dumpSchema(includeData),
      restoreSql: () => actionsRef.current?.restoreSql(),
      schemaInspector: () => actionsRef.current?.schemaInspector(),
      dumpTables: () => actionsRef.current?.dumpTables(),
      openServerAdmin: () => actionsRef.current?.openServerAdmin(),
      openSqlInTab: (sql) => actionsRef.current?.openSqlInTab?.(sql),
    };
    onActionsReadyRef.current?.(stable);

    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (!visibleRef.current) return;
      const a = actionsRef.current;
      if (!a) return;
      const k = e.key.toLowerCase();
      let handler: (() => void) | null = null;
      if (k === "t" && !e.shiftKey) handler = a.newQueryTab;
      else if (k === "w" && !e.shiftKey) handler = a.closeActiveTab;
      else if (k === "o" && !e.shiftKey) handler = a.openSqlFile;
      else if (k === "s") handler = e.shiftKey ? a.saveSqlFileAs : a.saveSqlFile;
      else if (k === "f" && e.shiftKey) handler = a.formatSql;
      else if (k === "h" && e.shiftKey) handler = a.globalSearch;
      if (handler) {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      onActionsReadyRef.current?.(null);
    };
  }, []);

  // ---- derived view state -------------------------------------------------

  const footerMsg = error || status;

  const visibleColumns = useMemo(() => {
    if (!details) return [];
    const qs = colFilter.trim().toLowerCase();
    if (!qs) return details.columns;
    return details.columns.filter((c) => c.name.toLowerCase().includes(qs));
  }, [details, colFilter]);

  const findView = useMemo(() => {
    if (!dataResult) return null;
    const needle = findText.trim().toLowerCase();
    if (!needle) return { result: dataResult, map: null as number[] | null };
    const map: number[] = [];
    const rows: unknown[][] = [];
    dataResult.rows.forEach((row, i) => {
      if (
        row.some((v) => v != null && String(v).toLowerCase().includes(needle))
      ) {
        map.push(i);
        rows.push(row);
      }
    });
    return { result: { ...dataResult, rows }, map };
  }, [dataResult, findText]);

  const mapIdx = (i: number) => findView?.map?.[i] ?? i;

  const editCtx = editContext();
  const pendingEdits =
    pending && editCtx && pending.result === editCtx.res ? pending.edits : null;
  const pendingCount = pendingEdits ? Object.keys(pendingEdits).length : 0;
  const queuedValue = (row: number, column: string) =>
    pendingEdits?.[`${row}\u0000${column}`]?.value;

  const sqlTabCount = tabs.filter((t) => t.kind === "sql").length;
  const canEditQuery =
    q.editMeta != null && connection.permissions.allowUpdate;
  const selectedCols = selectedTable ? columnsCache[selectedTable] : undefined;

  const footerResult =
    activeTab?.kind === "sql"
      ? (q.result ??
        (q.script ? (q.script[q.scriptIdx]?.result ?? null) : null))
      : activeTab?.kind === "data"
        ? findView?.result ?? null
        : null;

  return (
    <div
      data-testid="workspace-root"
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <div className="flex min-h-0 flex-1">
        {/* Entity browser */}
        <aside
          className="flex min-w-0 shrink-0 flex-col overflow-hidden border-r border-border bg-card"
          style={{ width: sidebarW }}
        >
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
            <button
              type="button"
              data-testid="btn-workspace-mode"
              className={cn(
                "block w-full truncate text-left text-sm font-semibold hover:text-primary",
                workspaceMode === "admin" && "text-primary",
              )}
              title={
                adminSupported(engine)
                  ? workspaceMode === "admin"
                    ? "Back to Objects (tables)"
                    : "Open Administration (Workbench-style)"
                  : connection.name
              }
              onClick={() => {
                if (!adminSupported(engine)) return;
                if (workspaceMode === "admin") {
                  setWorkspaceMode("objects");
                } else {
                  setAdminView(DEFAULT_ADMIN_VIEW);
                  setWorkspaceMode("admin");
                }
              }}
            >
              {connection.name}
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">
                {workspaceMode === "admin" ? "Administration" : "Objects"}
                {adminSupported(engine) ? " · click name to switch" : ""}
              </span>
              {isRestricted(connection.permissions) ? (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Shield className="size-3" />
                  restricted
                </Badge>
              ) : null}
            </div>
          </div>

          {workspaceMode === "admin" ? (
            <AdminNav active={adminView} onSelect={setAdminView} />
          ) : (
            <>
          <div className="space-y-1.5 border-b border-border px-2 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-8"
                placeholder="Filter tables"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                disabled={!schemaReady}
              />
            </div>
            {engine !== "sqlite" ? (
              <label className="flex items-center gap-1.5">
                <span className="shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {isMysqlLike(engine) ? "DB" : "Schema"}
                </span>
                <span className="relative min-w-0 flex-1">
                  <select
                    className="h-7 w-full cursor-pointer appearance-none rounded-md border border-border bg-transparent py-0 pr-7 pl-2 font-mono text-[11px] leading-none text-foreground outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/20"
                    value={selectedSchema}
                    disabled={!schemaReady || schema.length === 0}
                    onChange={(e) => void selectSchema(e.target.value)}
                    title={
                      isMysqlLike(engine) ? "Current database" : "Current schema"
                    }
                  >
                    <option value="">
                      All {isMysqlLike(engine) ? "databases" : "schemas"}
                    </option>
                    {schema.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </span>
              </label>
            ) : null}
          </div>

          <div className="flex items-center justify-between px-3 pb-1">
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Entities {schemaReady ? tableCount : "…"}
            </span>
            <div className="flex items-center">
              {hiddenTables.size > 0 ? (
                <button
                  type="button"
                  data-testid="btn-show-hidden"
                  className="mr-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Show hidden objects"
                  onClick={showAllHidden}
                >
                  Show {hiddenTables.size} hidden
                </button>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => {
                      setSchemaReady(false);
                      void loadSchema();
                    }}
                  >
                    <RefreshCw className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Refresh schema</TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title="New object"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                    disabled={!connection.permissions.allowDdl}
                  >
                    <Plus className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => openNewTable()}>
                    New table
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTemplatesOpen(true)}>
                    New table from template…
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={openNewView}>
                    New view
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => openNewRoutine()}
                  >
                    New routine
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={askNewSchema}>
                    {isMysqlLike(engine) ? "New database" : "New schema"}…
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setEventOpen(true)}>
                    New event… {isMysqlLike(engine) ? "" : "(MySQL only)"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTriggerOpen(true)}>
                    New trigger… {isMysqlLike(engine) ? "" : "(MySQL only)"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title="Dump / restore"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Database className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => void dumpSchema(false)}>
                    Dump schema SQL (all tables)…
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void dumpSchema(true)}>
                    Dump schema + data (one file)…
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDumpOpen(true)}>
                    Dump selected tables…
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSchemaInspectOpen(true)}>
                    Schema inspector (row counts)…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!connection.permissions.allowDdl}
                    onSelect={() => void importSqlFile()}
                  >
                    Restore SQL file…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="flex w-full min-w-0 max-w-full flex-col gap-0.5 px-1.5 pb-2">
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
                    {connection.engine !== "sqlite" && !selectedSchema ? (
                      <div className="group/schema flex items-center px-2 py-1 text-[10px] font-medium text-muted-foreground">
                        <span className="min-w-0 flex-1 truncate">
                          {schemaNode.name}
                        </span>
                        {!["public", "dbo"].includes(schemaNode.name) &&
                        connection.permissions.allowDdl ? (
                          <button
                            type="button"
                            title={`Drop ${isMysqlLike(engine) ? "database" : "schema"} ${schemaNode.name}`}
                            className="rounded p-0.5 opacity-0 hover:bg-background hover:text-destructive group-hover/schema:opacity-100"
                            onClick={() => askDropSchema(schemaNode.name)}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {schemaNode.children.map((c) => {
                      const full = tableRef(
                        schemaNode.name,
                        c.name,
                        connection.engine,
                      );
                      const selected = selectedTable === full;
                      const isView = c.kind === "view";
                      const ddl = connection.permissions.allowDdl;
                      return (
                        <div
                          key={full}
                          data-testid={`schema-row-${c.name}`}
                          className={cn(
                            "group flex w-full min-w-0 items-center overflow-hidden rounded-md",
                            selected && "bg-muted",
                          )}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setSelectedTable(full);
                            setMenuFor(full);
                          }}
                        >
                          <button
                            type="button"
                            data-testid={`schema-open-${c.name}`}
                            className="flex h-8 min-w-0 flex-1 basis-0 items-center gap-1.5 overflow-hidden px-2 text-left text-xs hover:bg-muted/80"
                            onClick={() => openData(full)}
                            onDoubleClick={() => openStructure(full)}
                          >
                            {isView ? (
                              <Eye className="size-3.5 shrink-0 opacity-60" />
                            ) : (
                              <Table2 className="size-3.5 shrink-0 opacity-60" />
                            )}
                            <span className="truncate">{c.name}</span>
                          </button>
                          <div
                            className={cn(
                              "ml-1 flex shrink-0 items-center",
                              menuFor === full
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100",
                            )}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  title="Structure"
                                  className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                                  onClick={() => openStructure(full)}
                                >
                                  <Wrench className="size-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Structure</TooltipContent>
                            </Tooltip>
                            <DropdownMenu
                              open={menuFor === full}
                              onOpenChange={(o) => setMenuFor(o ? full : null)}
                            >
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  title="Table actions"
                                  data-testid={`schema-menu-${c.name}`}
                                  className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground data-[state=open]:bg-background data-[state=open]:text-foreground"
                                >
                                  <MoreHorizontal className="size-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuItem
                                  onSelect={() => openData(full)}
                                >
                                  View Data
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => openStructure(full)}
                                >
                                  View Structure
                                </DropdownMenuItem>
                                {isView ? (
                                  <DropdownMenuItem
                                    disabled={!ddl}
                                    onSelect={() => void openViewEditor(full)}
                                  >
                                    Edit view
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    disabled={!ddl}
                                    onSelect={() => void openTableEditor(full)}
                                  >
                                    Edit table
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  disabled={busy}
                                  onSelect={() => void exportTableToFile(full)}
                                >
                                  Export To File…
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={
                                    busy ||
                                    !connection.permissions.allowInsert ||
                                    isView
                                  }
                                  onSelect={() => void importCsvIntoTable(full)}
                                >
                                  Import from File…
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() =>
                                    void copyText(shortTable(full))
                                  }
                                >
                                  Copy Name
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => hideTable(full)}
                                >
                                  Hide
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={busy}
                                  onSelect={() => void sqlCreateInTab(full)}
                                >
                                  SQL: Create
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => sqlSelectTop(full)}
                                >
                                  SQL: Select Top
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={isView || !ddl}
                                  onSelect={() => askRenameTable(full)}
                                >
                                  Rename…
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  disabled={!ddl}
                                  onSelect={() => askDrop(full)}
                                >
                                  Drop…
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  disabled={isView || !ddl}
                                  onSelect={() => askTruncate(full)}
                                >
                                  Truncate…
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={busy || isView || !ddl}
                                  onSelect={() => askDuplicateTable(full)}
                                >
                                  Duplicate…
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => onOpenTool?.("eer")}
                                >
                                  View ERD
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              {schemaReady && routines.length > 0 ? (
                <div>
                  <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground">
                    Routines (
                    {
                      routines.filter(
                        (r) =>
                          (!selectedSchema || r.schema === selectedSchema) &&
                          r.name
                            .toLowerCase()
                            .includes(filter.trim().toLowerCase()),
                      ).length
                    }
                    )
                  </div>
                  {routines
                    .filter(
                      (r) =>
                        (!selectedSchema || r.schema === selectedSchema) &&
                        r.name
                          .toLowerCase()
                          .includes(filter.trim().toLowerCase()),
                    )
                    .map((r) => (
                      <button
                        key={`${r.schema}.${r.name}.${r.kind}`}
                        type="button"
                        className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-xs hover:bg-muted/80"
                        title={`${r.kind} ${r.schema}.${r.name}`}
                        onClick={() => void openRoutineEditor(r)}
                      >
                        <Code2 className="size-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{r.name}</span>
                        <span className="ml-auto text-[9px] text-muted-foreground uppercase">
                          {r.kind === "procedure" ? "proc" : "fn"}
                        </span>
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
          </ScrollArea>

          {selectedTable ? (
            <div className="shrink-0 border-t border-border px-3 py-1.5 text-[11px]">
              <div
                className="truncate font-mono font-medium"
                title={selectedTable}
              >
                {selectedTable}
              </div>
              <div className="text-muted-foreground">
                {tableKinds[selectedTable] ?? "table"} ·{" "}
                {selectedCols ? `${selectedCols.length} columns` : "…"}
              </div>
            </div>
          ) : null}
            </>
          )}
        </aside>
        <ResizeHandle
          axis="x"
          className="z-10 -ml-px border-r border-border"
          onDelta={(d) =>
            setSidebarW((w) => {
              const next = clamp(w + d, 180, 480);
              localStorage.setItem("re-dbviewer.sidebarW", String(next));
              return next;
            })
          }
        />

        {/* Main — keep objects tree mounted in admin so CodeMirror survives */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {workspaceMode === "admin" ? (
            <AdminWorkbench
              connection={connection}
              view={adminView}
              actions={{
                dumpSchema: (includeData) => void dumpSchema(includeData),
                dumpTables: () => setDumpOpen(true),
                restoreSql: () => void importSqlFile(),
              }}
            />
          ) : null}
          <div
            className={
              workspaceMode === "admin"
                ? "hidden"
                : "flex min-h-0 min-w-0 flex-1 flex-col"
            }
            aria-hidden={workspaceMode === "admin"}
          >
          {/* Tab strip */}
          <div className="flex items-stretch border-b border-border bg-card">
            <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
              {tabs.map((t) => {
                const isActive = t.id === active;
                const closable = t.kind !== "sql" || sqlTabCount > 1;
                const hasOthers = tabs.length > 1;
                return (
                  <ContextMenu key={t.id}>
                    <ContextMenuTrigger asChild>
                      <button
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
                        ) : t.kind === "tableEdit" ? (
                          <Pencil className="size-3.5" />
                        ) : t.kind === "viewEdit" ? (
                          <Eye className="size-3.5" />
                        ) : t.kind === "routine" ? (
                          <Code2 className="size-3.5" />
                        ) : (
                          <Wrench className="size-3.5" />
                        )}
                        <span className="font-mono">
                          {t.kind === "sql"
                            ? t.label
                            : t.kind === "data"
                              ? `${shortTable(t.table)} [all]`
                              : t.kind === "tableEdit"
                                ? t.mode === "create"
                                  ? t.table.trim() || "New table"
                                  : `Edit ${shortTable(t.table)}`
                                : t.kind === "viewEdit"
                                  ? t.name.trim() || "New view"
                                  : t.kind === "routine"
                                    ? t.name.trim() || `New ${t.routineKind}`
                                    : shortTable(t.table)}
                        </span>
                        {closable ? (
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
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-44">
                      <ContextMenuItem
                        disabled={!closable}
                        onSelect={() => closeTab(t.id)}
                      >
                        Close
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={!hasOthers}
                        onSelect={() => closeOtherTabs(t.id)}
                      >
                        Close others
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        disabled={!hasOthers}
                        onSelect={() => closeAllTabs()}
                      >
                        Close all
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>
            <div className="flex items-center gap-1 border-l border-border px-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={iconBtn}
                    onClick={() => newQueryTab()}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New query tab (Ctrl+T)</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* SQL pane — keep mounted (single shared editor) */}
          <div
            className={
              sqlVisible
                ? "flex min-h-0 flex-1"
                : "pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
            }
            aria-hidden={!sqlVisible}
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={iconBtn}
                        onClick={() => void openSqlFile()}
                      >
                        <FolderOpen className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open SQL file (Ctrl+O)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={iconBtn}
                        onClick={() => void saveSqlFile(false)}
                      >
                        <Save className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Save SQL (Ctrl+S)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={iconBtn}
                        onClick={formatEditor}
                      >
                        <AlignLeft className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Format SQL (Ctrl+Shift+F)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant={snippetsOpen ? "secondary" : "ghost"}
                        className={iconBtn}
                        onClick={() => setSnippetsOpen((v) => !v)}
                      >
                        <BookMarked className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Snippets</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant={helpOpen ? "secondary" : "ghost"}
                        className={iconBtn}
                        onClick={() => setHelpOpen((v) => !v)}
                      >
                        <BookOpen className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Context help</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={iconBtn}
                        onClick={() => setSearchOpen(true)}
                      >
                        <Search className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Search data in tables (Ctrl+Shift+H)</TooltipContent>
                  </Tooltip>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={iconBtn}
                        title="Export / copy result"
                        disabled={
                          !q.result && !q.explainResult && !q.script?.length
                        }
                      >
                        <Download className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      {EXPORT_FORMATS.map((f) => (
                        <DropdownMenuItem
                          key={f.id}
                          onSelect={() => void exportQueryAs(f.id)}
                        >
                          Export {f.label}…
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      {EXPORT_FORMATS.filter((f) => f.id !== "csv").map((f) => (
                        <DropdownMenuItem
                          key={`copy-${f.id}`}
                          onSelect={() => void copyQueryAs(f.id)}
                        >
                          Copy as {f.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="ml-2 truncate text-[11px] text-muted-foreground">
                    {activeTab?.kind === "sql" && activeTab.filePath
                      ? activeTab.filePath
                      : "SQL editor"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 rounded-md border border-border px-0.5">
                    {txActive ? (
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 text-[10px] text-amber-600"
                        title="A transaction is open on this connection"
                      >
                        TX
                      </Badge>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[11px]"
                      disabled={busy || txActive}
                      title="Start a transaction (BEGIN)"
                      onClick={() => void runTx("begin")}
                    >
                      Begin
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[11px]"
                      disabled={busy || !txActive}
                      title="COMMIT"
                      onClick={() => void runTx("commit")}
                    >
                      Commit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[11px]"
                      disabled={busy || !txActive}
                      title="ROLLBACK"
                      onClick={() => void runTx("rollback")}
                    >
                      Rollback
                    </Button>
                  </div>
                  {busy && busyAction ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      title="Stop waiting — the server may still finish the statement"
                      onClick={stopRun}
                    >
                      <Square className="size-3.5" />
                      Stop
                    </Button>
                  ) : null}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        data-testid="btn-run-query"
                        size="sm"
                        disabled={busy}
                        onClick={() => void runSql()}
                        style={{ backgroundColor: accent, color: "#111" }}
                        className="hover:opacity-90"
                      >
                        {busy && busyAction === "run" ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Play className="size-3.5" />
                        )}
                        Run
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Runs selection or current statement · Ctrl/⌘ + Enter
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    title="Run all statements (selection or whole editor), continue on error · Ctrl/⌘ + Shift + Enter"
                    onClick={() => void runScript()}
                  >
                    {busy && busyAction === "script" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ListChecks className="size-3.5" />
                    )}
                    Script
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    title={
                      connection.engine === "mssql"
                        ? "Explain is not supported for SQL Server yet"
                        : "Show query plan (EXPLAIN)"
                    }
                    onClick={() => void explainSql()}
                  >
                    {busy && busyAction === "explain" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Activity className="size-3.5" />
                    )}
                    Explain
                  </Button>
                  <label
                    className={cn(
                      "flex items-center gap-1.5 text-[11px] text-muted-foreground",
                      connection.engine === "sqlite" ||
                        connection.engine === "mssql"
                        ? "opacity-50"
                        : null,
                    )}
                    title={
                      connection.engine === "sqlite"
                        ? "SQLite uses EXPLAIN QUERY PLAN (Analyze N/A)"
                        : connection.engine === "mssql"
                          ? "Explain not supported on SQL Server yet"
                          : "EXPLAIN ANALYZE — SELECT / WITH / VALUES only"
                    }
                  >
                    <input
                      type="checkbox"
                      className="size-3.5 accent-primary"
                      checked={q.analyzeExplain}
                      disabled={
                        busy ||
                        connection.engine === "sqlite" ||
                        connection.engine === "mssql"
                      }
                      onChange={(e) =>
                        activeTab?.kind === "sql" &&
                        setQ(activeTab.id, { analyzeExplain: e.target.checked })
                      }
                    />
                    Analyze
                  </label>
                </div>
              </div>
              <div
                ref={editorHost}
                data-testid="sql-editor"
                className={cn(
                  "overflow-auto border-b border-border bg-card",
                  (q.result || q.explainResult || q.script) && sqlVisible
                    ? "shrink-0"
                    : "min-h-0 flex-1",
                )}
                style={
                  (q.result || q.explainResult || q.script) && sqlVisible
                    ? { height: editorH }
                    : undefined
                }
              />
              {(q.result || q.explainResult || q.script) && sqlVisible ? (
                <ResizeHandle
                  axis="y"
                  className="z-10 border-b border-border"
                  onDelta={(d) =>
                    setEditorH((h) => {
                      const next = clamp(h + d, 96, 560);
                      localStorage.setItem(
                        "re-dbviewer.editorH",
                        String(next),
                      );
                      return next;
                    })
                  }
                />
              ) : null}
              {sqlVisible && q.explainResult ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1">
                    {(["table", "chart"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={cn(
                          "relative h-7 px-2 text-xs capitalize",
                          q.explainView === v
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() =>
                          activeTab?.kind === "sql" &&
                          setQ(activeTab.id, { explainView: v })
                        }
                      >
                        {v === "chart" ? "Visual" : "Table"}
                        {q.explainView === v ? (
                          <span
                            className="absolute inset-x-0 bottom-0 h-0.5"
                            style={{ backgroundColor: accent }}
                          />
                        ) : null}
                      </button>
                    ))}
                    {q.prevExplainResult ? (
                      <Button
                        size="xs"
                        variant={showCompare ? "secondary" : "outline"}
                        className="ml-auto"
                        title="Compare with the previous plan in this tab"
                        onClick={() => setShowCompare((v) => !v)}
                      >
                        Compare plans
                      </Button>
                    ) : null}
                  </div>
                  {showCompare && q.prevExplainResult
                    ? (() => {
                        const c = comparePlans(q.prevExplainResult, q.explainResult);
                        const cost = (p: typeof c.prev) =>
                          p.cost == null ? "n/a" : `${p.cost}${p.costLabel ? ` (${p.costLabel})` : ""}`;
                        return (
                          <div className="shrink-0 border-b border-border bg-muted/30 px-3 py-1.5 font-mono text-[11px]">
                            previous: {c.prev.steps} step(s), cost {cost(c.prev)}
                            {"  →  "}
                            current: {c.cur.steps} step(s), cost {cost(c.cur)}
                            {c.costDeltaPct != null
                              ? ` · ${c.costDeltaPct > 0 ? "+" : ""}${c.costDeltaPct}% cost`
                              : ""}
                          </div>
                        );
                      })()
                    : null}
                  {q.explainView === "table" ? (
                    <ResultGrid result={q.explainResult} />
                  ) : (
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <VisualExplain result={q.explainResult} />
                    </div>
                  )}
                </div>
              ) : null}
              {sqlVisible && !q.result && !q.explainResult && !q.script && !busy ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-muted-foreground">
                  <div className="grid gap-2 font-mono text-xs">
                    <div className="flex justify-between gap-10">
                      <span>Run query</span>
                      <span>Ctrl/⌘ + Enter</span>
                    </div>
                    <div className="flex justify-between gap-10">
                      <span>Explain plan</span>
                      <span>Explain button</span>
                    </div>
                    <div className="flex justify-between gap-10">
                      <span>Open table</span>
                      <span>Click entity</span>
                    </div>
                  </div>
                </div>
              ) : null}
              {sqlVisible && q.script && !q.explainResult ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2">
                    {q.script.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        title={r.sql}
                        className={cn(
                          "relative flex h-7 shrink-0 items-center gap-1 px-2 text-xs",
                          q.scriptIdx === i
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() =>
                          activeTab?.kind === "sql" &&
                          setQ(activeTab.id, { scriptIdx: i })
                        }
                      >
                        <span
                          className={r.ok ? "text-emerald-600" : "text-destructive"}
                        >
                          {r.ok ? "✓" : "✗"}
                        </span>
                        Result {i + 1}
                        {q.scriptIdx === i ? (
                          <span
                            className="absolute inset-x-0 bottom-0 h-0.5"
                            style={{ backgroundColor: accent }}
                          />
                        ) : null}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const r = q.script[Math.min(q.scriptIdx, q.script.length - 1)];
                    if (!r) return null;
                    return r.ok && r.result ? (
                      <>
                        <div className="shrink-0 truncate border-b border-border bg-muted/30 px-3 py-1 font-mono text-[11px] text-muted-foreground">
                          {r.sql.replace(/\s+/g, " ")} · {r.durationMs}ms
                        </div>
                        <ResultGrid
                          result={r.result}
                          exportContext={{ table: "table_name", engine }}
                        />
                      </>
                    ) : (
                      <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
                        <div className="mb-2 font-mono text-muted-foreground">
                          {r.sql}
                        </div>
                        <div className="whitespace-pre-wrap text-destructive">
                          {r.error}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : null}
              {sqlVisible && q.result && !q.explainResult ? (
                <ResultPinBar
                  current={q.result}
                  currentSql={q.lastSql}
                  pinned={pinned}
                  onPin={() => {
                    if (q.result) setPinned({ sql: q.lastSql, result: q.result });
                  }}
                  onUnpin={() => setPinned(null)}
                />
              ) : null}
              {sqlVisible && q.result && !q.explainResult ? (
                <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border px-2 py-1">
                  <div className="flex items-center rounded-md border border-border">
                    <button
                      type="button"
                      className={cn(
                        "flex h-6 items-center gap-1 rounded-l-md px-2 text-[11px]",
                        dataView === "grid"
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setDataView("grid")}
                    >
                      <Rows3 className="size-3" />
                      Grid
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "flex h-6 items-center gap-1 rounded-r-md px-2 text-[11px]",
                        dataView === "json"
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setDataView("json")}
                    >
                      <Braces className="size-3" />
                      JSON
                    </button>
                  </div>
                </div>
              ) : null}
              {sqlVisible &&
              q.result &&
              !q.explainResult &&
              canEditQuery ? (
                <BatchEditBar
                  enabled={batchMode}
                  onToggle={setBatchMode}
                  count={pendingCount}
                  busy={busy}
                  onApply={() => void applyPending()}
                  onDiscard={() => setPending(null)}
                />
              ) : null}
              {sqlVisible && q.result && !q.explainResult ? (
                dataView === "json" ? (
                  <JsonResultView
                    result={q.result}
                    onCellEdit={
                      canEditQuery
                        ? (rowIndex, column, value) =>
                            handleCellEdit(rowIndex, column, value)
                        : undefined
                    }
                    cellOverride={queuedValue}
                  />
                ) : (
                  <ResultGrid
                    result={q.result}
                    exportContext={{
                      table: q.editMeta?.table ?? "table_name",
                      engine,
                    }}
                    columnsMeta={q.editMeta?.columns}
                    onCellEdit={
                      canEditQuery
                        ? (rowIndex, column, value) =>
                            handleCellEdit(rowIndex, column, value)
                        : undefined
                    }
                    cellOverride={queuedValue}
                  />
                )
              ) : null}
            </div>
            {helpOpen ? (
              <ContextHelpPanel
                word={helpWord}
                onInsert={insertAtCursor}
                onClose={() => setHelpOpen(false)}
              />
            ) : null}
            {snippetsOpen ? (
              <SnippetsPanel
                snippets={snippets}
                draftSql={currentDraftSql()}
                onInsert={insertSnippet}
                onSave={(title) =>
                  setSnippets(
                    saveUserSnippet(connection.id, title, currentDraftSql()),
                  )
                }
                onDelete={(id) =>
                  setSnippets(deleteUserSnippet(connection.id, id))
                }
                onClose={() => setSnippetsOpen(false)}
                bookmarks={bookmarks}
                onSaveBookmark={(title) =>
                  setBookmarks(saveBookmark(connection.id, title, currentDraftSql()))
                }
                onDeleteBookmark={(id) =>
                  setBookmarks(deleteBookmark(connection.id, id))
                }
              />
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

              {/* Find in page + Grid/JSON toggle */}
              <div className="flex items-center gap-2 border-b border-border px-2 py-1">
                <div className="relative w-56">
                  <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-7 pl-7 text-xs"
                    placeholder="Find in loaded rows"
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                  />
                </div>
                {findText.trim() && dataResult ? (
                  <span className="text-[11px] text-muted-foreground">
                    {findView?.result.rows.length ?? 0} / {dataResult.rows.length}
                  </span>
                ) : null}
                <div className="ml-auto flex items-center rounded-md border border-border">
                  <button
                    type="button"
                    className={cn(
                      "flex h-6 items-center gap-1 rounded-l-md px-2 text-[11px]",
                      dataView === "grid"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setDataView("grid")}
                  >
                    <Rows3 className="size-3" />
                    Grid
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex h-6 items-center gap-1 rounded-r-md px-2 text-[11px]",
                      dataView === "json"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setDataView("json")}
                  >
                    <Braces className="size-3" />
                    JSON
                  </button>
                </div>
              </div>

              {connection.permissions.allowUpdate ? (
                <BatchEditBar
                  enabled={batchMode}
                  onToggle={setBatchMode}
                  count={pendingCount}
                  busy={busy}
                  onApply={() => void applyPending()}
                  onDiscard={() => setPending(null)}
                />
              ) : null}

              {findView ? (
                dataView === "json" ? (
                  <JsonResultView
                    result={findView.result}
                    hiddenColumns={hiddenColumns}
                    onCellEdit={(rowIndex, column, value) =>
                      handleCellEdit(mapIdx(rowIndex), column, value)
                    }
                    cellOverride={(rowIndex, column) =>
                      queuedValue(mapIdx(rowIndex), column)
                    }
                  />
                ) : (
                  <ResultGrid
                    result={findView.result}
                    exportContext={{ table: activeTab.table, engine }}
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
                    onCellEdit={(rowIndex, column, value) =>
                      handleCellEdit(mapIdx(rowIndex), column, value)
                    }
                    cellOverride={(rowIndex, column) =>
                      queuedValue(mapIdx(rowIndex), column)
                    }
                    onRowDelete={(rowIndex) => void deleteRow(mapIdx(rowIndex))}
                    onDeleteSelected={(rowIndexes) =>
                      void deleteSelectedRows(rowIndexes.map(mapIdx))
                    }
                    selectedRowIndexes={selectedRowIndexes}
                    onSelectionChange={setSelectedRowIndexes}
                  />
                )
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
                <span
                  className="ml-auto max-w-[55%] truncate font-mono text-[11px] text-muted-foreground"
                  title={formatTableStatsLine({
                    table: activeTab.table,
                    columns: details?.columns.length,
                    indexes: details?.indexes.length,
                    fks: details?.foreignKeys.length,
                    stats:
                      structStats?.table === activeTab.table
                        ? structStats.stats
                        : null,
                    loading:
                      structStats?.table === activeTab.table &&
                      structStats.loading,
                  })}
                >
                  {formatTableStatsLine({
                    table: activeTab.table,
                    columns: details?.columns.length,
                    indexes: details?.indexes.length,
                    fks: details?.foreignKeys.length,
                    stats:
                      structStats?.table === activeTab.table
                        ? structStats.stats
                        : null,
                    loading:
                      structStats?.table === activeTab.table &&
                      structStats.loading,
                  })}
                </span>
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
                      onClick={() => {
                        void loadDetails(activeTab.table);
                        void loadStructStats(activeTab.table);
                      }}
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
                details ? (
                  <RelationQueryBuilder
                    table={activeTab.table}
                    engine={engine}
                    connectionId={connection.id}
                    details={details}
                    onOpenSql={(sqlText) => newQueryTab(sqlText)}
                  />
                ) : (
                  <div className="p-4 text-sm text-muted-foreground">
                    Loading table metadata…
                  </div>
                )
              ) : null}
            </div>
          ) : null}

          {/* Table editor pane */}
          {activeTab?.kind === "tableEdit" ? (
            <TableEditor
              mode={activeTab.mode}
              engine={engine}
              tableName={activeTab.table}
              onTableNameChange={(name) =>
                patchTableEdit(activeTab.id, { table: name })
              }
              columns={activeTab.columns}
              onChange={(cols) => patchTableEdit(activeTab.id, { columns: cols })}
              indexes={activeTab.indexes}
              onIndexesChange={(v) => patchTableEdit(activeTab.id, { indexes: v })}
              fks={activeTab.fks}
              onFksChange={(v) => patchTableEdit(activeTab.id, { fks: v })}
              advanced={activeTab.advanced ?? EMPTY_ADVANCED}
              onAdvancedChange={
                isMysqlLike(engine)
                  ? (v) => patchTableEdit(activeTab.id, { advanced: v })
                  : undefined
              }
              ddlPreview={tableEditDdl(activeTab)}
              canApply={hasExecutableSql(tableEditDdl(activeTab))}
              busy={busy || !connection.permissions.allowDdl}
              onApply={() => void applyTableEdit(activeTab)}
              onOpenInQuery={() => newQueryTab(tableEditDdl(activeTab))}
            />
          ) : null}

          {activeTab?.kind === "viewEdit" ? (
            <ViewEditor
              mode={activeTab.mode}
              name={activeTab.name}
              body={activeTab.body}
              ddl={viewEditDdl(activeTab)}
              busy={busy || !connection.permissions.allowDdl}
              onName={(name) => patchViewEdit(activeTab.id, { name })}
              onBody={(body) => patchViewEdit(activeTab.id, { body })}
              onApply={() => void applyViewEdit(activeTab)}
              onOpenInQuery={() => newQueryTab(viewEditDdl(activeTab))}
            />
          ) : null}

          {activeTab?.kind === "routine" ? (
            <RoutineEditor
              mode={activeTab.mode}
              supported={isMysqlLike(engine)}
              unsupportedTip={
                engine === "sqlite"
                  ? "SQLite has no stored procedures or functions — nothing to create here."
                  : `The routine editor supports MySQL / MariaDB only. For ${engine}, write CREATE FUNCTION / PROCEDURE in a Query tab.`
              }
              name={activeTab.name}
              kind={activeTab.routineKind}
              body={activeTab.body}
              ddl={routineDdl(activeTab)}
              busy={busy || !connection.permissions.allowDdl}
              onName={(name) => patchRoutine(activeTab.id, { name })}
              onKind={(k) =>
                patchRoutine(activeTab.id, {
                  routineKind: k,
                  body: routineTemplate(k),
                })
              }
              onBody={(body) => patchRoutine(activeTab.id, { body })}
              onApply={() => void applyRoutine(activeTab)}
              onOpenInQuery={() => newQueryTab(routineDdl(activeTab))}
            />
          ) : null}

          <QueryHistoryPanel
            entries={history}
            open={historyOpen}
            onToggle={() => setHistoryOpen((v) => !v)}
            onReuse={(stmt) => insertAtCursor(stmt)}
            textLog={textLog}
            onClearText={() => setTextLog([])}
          />
          </div>
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
          ) : activeTab?.kind === "tableEdit" ? (
            <span className="text-muted-foreground">Table editor</span>
          ) : activeTab?.kind === "viewEdit" ? (
            <span className="text-muted-foreground">View editor</span>
          ) : activeTab?.kind === "routine" ? (
            <span className="text-muted-foreground">Routine editor</span>
          ) : (
            <span className="text-muted-foreground">Query</span>
          )}
          <span className="text-muted-foreground/40">|</span>
          <span
            data-testid="workspace-status"
            className={cn(
              "min-w-0 truncate",
              error ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {busy
              ? "Working…"
              : footerMsg ||
                (footerResult
                  ? (footerResult.rowsAffected != null
                      ? `${footerResult.rowsAffected} affected`
                      : `${footerResult.rows.length} rows`) +
                    (activeTab?.kind === "sql" && q.durationMs != null
                      ? ` · ${q.durationMs}ms`
                      : "") +
                    (activeTab?.kind === "sql" && q.editMeta
                      ? ` · editable (${shortTable(q.editMeta.table)})`
                      : "")
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
                    offset: Math.max(0, activeTab.offset - pageSize),
                  })
                }
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="min-w-6 text-center font-mono text-muted-foreground">
                {Math.floor(activeTab.offset / pageSize) + 1}
              </span>

              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                disabled={busy || (dataResult?.rows.length ?? 0) < pageSize}
                onClick={() =>
                  updateActiveData({ offset: activeTab.offset + pageSize })
                }
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}

        <div className="relative z-10 ml-auto flex max-w-[50%] items-center gap-2">
          <SessionInfoStrip
            connection={connection}
            database={selectedSchema || connection.config.database}
          />
          {activeTab?.kind === "data" ? (
          <div className="flex items-center gap-0.5">
            <select
              className="mr-1 h-6 rounded border border-input bg-background px-1 text-[11px] text-foreground outline-none dark:[color-scheme:dark]"
              value={pageSize}
              disabled={busy}
              title="Rows per page"
              onChange={(e) => changePageSize(Number(e.target.value))}
            >
              {[...new Set([...PAGE_SIZES, pageSize])]
                .sort((a, b) => a - b)
                .map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
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
              onClick={() => {
                if (draftRow) {
                  setDraftRow(null);
                  setStatus("Add row cancelled");
                  return;
                }
                startAddRow();
              }}
              title={draftRow ? "Cancel add row (Esc)" : "Add row"}
            >
              {draftRow ? (
                <X className="size-3.5" />
              ) : (
                <Plus className="size-3.5" />
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  disabled={busy}
                  title="Table actions"
                >
                  <Settings className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              {/* Bottom-right footer: open up + align end so the panel stays on-screen */}
              <DropdownMenuContent
                side="top"
                align="end"
                sideOffset={6}
                collisionPadding={12}
                className="w-52"
              >
                <DropdownMenuItem onClick={() => void exportCsv(false)}>
                  Export whole table
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportCsv(true)}>
                  Export filtered view
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Export loaded rows</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    collisionPadding={12}
                    className="w-40"
                  >
                    {EXPORT_FORMATS.map((f) => (
                      <DropdownMenuItem
                        key={f.id}
                        onClick={() => void exportQueryAs(f.id)}
                      >
                        {f.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    Hide columns
                    {hiddenColumns.length > 0
                      ? ` (${hiddenColumns.length})`
                      : ""}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    collisionPadding={12}
                    className="max-h-64 w-44 overflow-auto"
                  >
                    {(details?.columns ??
                      dataResult?.columns.map((name) => ({ name })) ??
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
                  Import CSV (append)
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!connection.permissions.allowDelete}
                  onClick={() => void importCsv("replace")}
                >
                  Import CSV (replace all rows)…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void importJson()}>
                  Import JSON (array of objects)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void importSqlFile()}>
                  Restore / import SQL file
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void dumpSchema(true)}>
                  Dump all tables to one file…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDumpOpen(true)}>
                  Dump selected tables…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => copyViewToSql()}>
                  Copy view to SQL
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          ) : null}
        </div>
      </footer>

      <TableTemplatesDialog
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onUse={(cols) => openNewTable(cols)}
      />
      <EventDialog
        open={eventOpen}
        engine={engine}
        connectionId={connection.id}
        onClose={() => setEventOpen(false)}
        onCreated={() => setStatus("Event created")}
      />
      <TriggerDialog
        open={triggerOpen}
        engine={engine}
        connectionId={connection.id}
        tables={Object.keys(tableKinds).filter((t) => tableKinds[t] !== "view")}
        defaultTable={selectedTable}
        onClose={() => setTriggerOpen(false)}
        onCreated={() => setStatus("Trigger created")}
      />
      <SchemaInspectorDialog
        open={schemaInspectOpen}
        engine={engine}
        connectionId={connection.id}
        schema={schema}
        onClose={() => setSchemaInspectOpen(false)}
        onOpenTable={(ref) => openData(ref)}
      />
      <DumpTablesDialog
        open={dumpOpen}
        engine={engine}
        connectionId={connection.id}
        connectionName={connection.name}
        tables={Object.keys(tableKinds).filter((t) => tableKinds[t] !== "view")}
        onClose={() => setDumpOpen(false)}
        onDone={(m) => {
          setError("");
          setStatus(m);
        }}
      />

      <Dialog
        open={confirm != null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.title}</DialogTitle>
            <DialogDescription>{confirm?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void runConfirm()}>
              {confirm?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PromptDialog request={prompt} onClose={() => setPrompt(null)} />
      <GlobalSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSearch={globalSearch}
        onOpenTable={(table, filters) => openData(table, filters)}
      />
      <TableInspectorDialog
        data={inspector}
        onClose={() => setInspector(null)}
        onOpenInQuery={(sqlText) => newQueryTab(sqlText)}
      />
    </div>
  );
}
