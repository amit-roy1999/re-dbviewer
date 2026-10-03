import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EditorView, basicSetup } from "codemirror";
import { sql } from "@codemirror/lang-sql";
import { keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { ArrowLeft, Play, Table2, Eye, Shield } from "lucide-react";
import type { QueryResult, SavedConnection, SchemaNode } from "@/types";
import { isRestricted } from "@/types";
import { ResultGrid } from "@/components/ResultGrid";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Props = {
  connection: SavedConnection;
  onBack: () => void;
};

type Tab =
  | { kind: "sql"; id: "sql" }
  | { kind: "table"; id: string; table: string; offset: number };

const PAGE = 100;

export default function Workspace({ connection, onBack }: Props) {
  const [schema, setSchema] = useState<SchemaNode[]>([]);
  const [filter, setFilter] = useState("");
  const [tabs, setTabs] = useState<Tab[]>([{ kind: "sql", id: "sql" }]);
  const [active, setActive] = useState("sql");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const editorHost = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const sqlText = useRef(
    connection.engine === "sqlite"
      ? "SELECT name FROM sqlite_master WHERE type='table';"
      : "SELECT 1;",
  );

  useEffect(() => {
    invoke<SchemaNode[]>("list_schema")
      .then(setSchema)
      .catch((e) => setError(String(e)));
  }, []);

  // Keep CodeMirror mounted once — do not destroy on tab switch
  useEffect(() => {
    if (!editorHost.current || editorRef.current) return;
    const view = new EditorView({
      doc: sqlText.current,
      parent: editorHost.current,
      extensions: [
        basicSetup,
        sql(),
        keymap.of(defaultKeymap),
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
    return schema.map((s) => ({
      ...s,
      children: s.children.filter((c) => c.name.toLowerCase().includes(q)),
    }));
  }, [schema, filter]);

  async function back() {
    await invoke("close_connection");
    onBack();
  }

  function openTable(table: string) {
    const id = `table:${table}`;
    setTabs((prev) =>
      prev.some((t) => t.id === id)
        ? prev
        : [...prev, { kind: "table", id, table, offset: 0 }],
    );
    setActive(id);
  }

  async function loadTable(table: string, offset: number) {
    setBusy(true);
    setError("");
    try {
      const res = await invoke<QueryResult>("preview_table", {
        table,
        limit: PAGE,
        offset,
      });
      setResult(res);
      setTabs((prev) =>
        prev.map((t) =>
          t.kind === "table" && t.table === table ? { ...t, offset } : t,
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runSql() {
    setBusy(true);
    setError("");
    try {
      setResult(await invoke<QueryResult>("run_sql", { sql: sqlText.current }));
      setActive("sql");
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

  const activeTab = tabs.find((t) => t.id === active);

  useEffect(() => {
    if (activeTab?.kind === "table") {
      void loadTable(activeTab.table, activeTab.offset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="min-w-0 flex-1 justify-start"
              onClick={back}
            >
              <ArrowLeft className="size-4" />
              Connections
            </Button>
            <ThemeToggle />
          </div>
          <div className="truncate px-1 text-sm font-semibold">{connection.name}</div>
          <div className="flex flex-wrap items-center gap-1 px-1">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: connection.accentColor || "#2563eb" }}
            />
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
          <Input
            className="h-8"
            placeholder="Search tables…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 p-2">
            {filtered.map((schemaNode) => (
              <div key={schemaNode.name}>
                <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  {schemaNode.name}
                </div>
                {schemaNode.children.map((c) => (
                  <Button
                    key={c.name}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full justify-start gap-1.5 px-2 font-normal"
                    onClick={() => openTable(c.name)}
                  >
                    {c.kind === "view" ? (
                      <Eye className="size-3.5 opacity-70" />
                    ) : (
                      <Table2 className="size-3.5 opacity-70" />
                    )}
                    <span className="truncate">{c.name}</span>
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b bg-muted/40 px-2 py-1.5">
          <Tabs
            value={active}
            onValueChange={setActive}
            className="min-w-0 flex-1"
          >
            <TabsList variant="line" className="h-8 w-full justify-start overflow-x-auto">
              {tabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="gap-1 px-2 text-xs">
                  {t.kind === "sql" ? "SQL" : t.table}
                  {t.kind !== "sql" ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className="ml-0.5 rounded px-1 hover:bg-muted"
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
                      ×
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* SQL editor stays mounted; hide when inactive */}
        <div
          className={
            active === "sql"
              ? "flex flex-col border-b"
              : "pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
          }
          aria-hidden={active !== "sql"}
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <Button size="sm" disabled={busy} onClick={runSql}>
              <Play className="size-3.5" />
              Run
            </Button>
            <Badge variant="outline" className="font-mono text-[10px]">
              Ctrl/Cmd+Enter later
            </Badge>
          </div>
          <div ref={editorHost} className="h-44 overflow-auto border-t" />
        </div>

        {activeTab?.kind === "table" ? (
          <div className="flex items-center gap-3 border-b px-3 py-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || activeTab.offset === 0}
              onClick={() =>
                loadTable(activeTab.table, Math.max(0, activeTab.offset - PAGE))
              }
            >
              Prev
            </Button>
            <span className="font-mono text-xs text-muted-foreground">
              offset {activeTab.offset} · limit {PAGE}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || (result?.rows.length ?? 0) < PAGE}
              onClick={() => loadTable(activeTab.table, activeTab.offset + PAGE)}
            >
              Next
            </Button>
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive" className="m-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {result ? <ResultGrid result={result} /> : null}
      </main>
    </div>
  );
}
