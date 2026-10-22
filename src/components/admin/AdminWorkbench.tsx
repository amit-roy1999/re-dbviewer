import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Circle,
  Download,
  Play,
  RefreshCw,
  Skull,
  Upload,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { confirm as confirmNative } from "@tauri-apps/plugin-dialog";
import type { QueryResult, SavedConnection } from "@/types";
import { runScript, runSql } from "@/lib/dbApi";
import {
  adminSql,
  adminSupported,
  createUserSql,
  dropUserSql,
  fmtUptime,
  grantsSql,
  isMysqlFamily,
  kvMap,
  queryTypeBucket,
  type AdminTab,
  type QueryTypeFilter,
} from "@/lib/adminSql";
import type { AdminViewId } from "@/lib/adminNav";
import { AdminTable } from "@/components/tools/AdminTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AdminActions = {
  dumpSchema: (includeData: boolean) => void;
  dumpTables: () => void;
  restoreSql: () => void;
};

function useAdminQuery(engine: string, connectionId: string, tab: AdminTab | null) {
  const [results, setResults] = useState<(QueryResult | null)[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tab || !adminSupported(engine)) return;
    setBusy(true);
    const sqls = adminSql(engine, tab);
    const res: (QueryResult | null)[] = [];
    const errs: string[] = [];
    for (const sql of sqls) {
      try {
        res.push(await runSql(sql, connectionId));
        errs.push("");
      } catch (e) {
        res.push(null);
        errs.push(String(e));
      }
    }
    setResults(res);
    setErrors(errs);
    setBusy(false);
  }, [engine, connectionId, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  return { results, errors, busy, load };
}

function PanelHeader({
  title,
  busy,
  onRefresh,
  children,
}: {
  title: string;
  busy?: boolean;
  onRefresh?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="ml-auto flex items-center gap-1.5">
        {children}
        {onRefresh ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onRefresh}>
            <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
            Refresh
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function FeatureDot({ on, label, detail }: { on: boolean | null; label: string; detail?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Circle
        className={cn(
          "size-2.5 fill-current",
          on === true
            ? "text-emerald-500"
            : on === false
              ? "text-muted-foreground/40"
              : "text-amber-500",
        )}
      />
      <span>{label}</span>
      {detail ? (
        <span className="font-mono text-muted-foreground">{detail}</span>
      ) : null}
    </div>
  );
}

function StubView({
  title,
  reason,
}: {
  title: string;
  reason: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title={title} />
      <div className="p-4">
        <Alert>
          <AlertDescription>
            <p className="font-medium">{title} is not available from this client.</p>
            <p className="mt-1 text-muted-foreground">{reason}</p>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}

function ServerStatusView({
  connection,
}: {
  connection: SavedConnection;
}) {
  const { results, errors, busy, load } = useAdminQuery(
    connection.engine,
    connection.id,
    "serverStatus",
  );
  const my = isMysqlFamily(connection.engine);
  const info = results[0]?.rows[0];
  const status = kvMap(results[1] ?? null);
  const vars = kvMap(results[2] ?? null);
  const plugins = results[3];

  const uptimeSec = Number(status.Uptime ?? status.uptime ?? NaN);
  const poolTotal = Number(status.Innodb_buffer_pool_pages_total ?? 0);
  const poolFree = Number(status.Innodb_buffer_pool_pages_free ?? 0);
  const bufferPct =
    poolTotal > 0
      ? `${(((poolTotal - poolFree) / poolTotal) * 100).toFixed(1)}%`
      : "—";
  const keyReq = Number(status.Key_read_requests ?? 0);
  const keyReads = Number(status.Key_reads ?? 0);
  const keyEff =
    keyReq > 0 ? `${((1 - keyReads / keyReq) * 100).toFixed(1)}%` : "—";

  const bytesRecv = Number(status.Bytes_received ?? 0);
  const bytesSent = Number(status.Bytes_sent ?? 0);
  const traffic =
    uptimeSec > 0
      ? `${(((bytesRecv + bytesSent) / uptimeSec) / 1024).toFixed(2)} KB/s`
      : "—";

  const ssl =
    vars.have_ssl === "YES" ||
    vars.have_openssl === "YES" ||
    vars.ssl === "on";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        title="Administration — Server Status"
        busy={busy}
        onRefresh={() => void load()}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {errors.some(Boolean) ? (
          <Alert variant="destructive">
            <AlertDescription>{errors.filter(Boolean).join(" · ")}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div>
                <h3 className="text-lg font-semibold">{connection.name}</h3>
                <div className="mt-1 flex items-center gap-2">
                  <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                    <Play className="size-3 fill-current" />
                    Running
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {connection.engine}
                  </span>
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {(
                [
                  ["Host", my ? String(info?.[1] ?? connection.config.host ?? "—") : String(info?.[1] ?? connection.config.host ?? "—")],
                  ["Port", my ? String(info?.[2] ?? connection.config.port ?? vars.port ?? "—") : String(info?.[2] ?? connection.config.port ?? "—")],
                  ["User", connection.config.user ?? "—"],
                  ["Database", connection.config.database ?? "—"],
                  ["Version", my ? String(info?.[0] ?? vars.version ?? "—") : String(info?.[0] ?? "—")],
                  ["Compiled for", my ? `${info?.[4] ?? ""} ${info?.[5] ?? ""}`.trim() || "—" : "—"],
                  ["Socket", vars.socket || connection.config.socketPath || "—"],
                  ["Running since", fmtUptime(uptimeSec)],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="truncate font-mono" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricCard label="Connections" value={status.Threads_connected ?? status.connections ?? "—"} />
            <MetricCard label="Traffic" value={traffic} />
            <MetricCard label="Key efficiency" value={keyEff} />
            <MetricCard label="Selects" value={status.Com_select ?? "—"} />
            <MetricCard label="InnoDB buffer" value={bufferPct} />
            <MetricCard label="InnoDB writes/s" value={
              uptimeSec > 0 && status.Innodb_data_writes
                ? (Number(status.Innodb_data_writes) / uptimeSec).toFixed(1)
                : "—"
            } />
            <MetricCard label="Questions" value={status.Questions ?? "—"} />
            <MetricCard label="Slow queries" value={status.Slow_queries ?? "—"} />
            <MetricCard label="Threads running" value={status.Threads_running ?? "—"} />
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Available server features
          </h4>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <FeatureDot
              on={vars.performance_schema === "ON" || vars.performance_schema === "1"}
              label="Performance Schema"
              detail={vars.performance_schema || undefined}
            />
            <FeatureDot on={ssl} label="SSL availability" />
            <FeatureDot
              on={vars.general_log === "ON" || vars.general_log === "1"}
              label="General log"
            />
            <FeatureDot
              on={vars.slow_query_log === "ON" || vars.slow_query_log === "1"}
              label="Slow query log"
            />
            {plugins ? (
              <>
                <FeatureDot
                  on={plugins.rows.some((r) => String(r[0]).toLowerCase().includes("thread_pool") && String(r[1]).toUpperCase() === "ACTIVE")}
                  label="Thread Pool"
                />
                <FeatureDot
                  on={plugins.rows.some((r) => String(r[0]).toLowerCase().includes("memcached") && String(r[1]).toUpperCase() === "ACTIVE")}
                  label="Memcached Plugin"
                />
              </>
            ) : null}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Server directories
          </h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {(
              [
                ["Base directory", vars.basedir ?? "—"],
                ["Data directory", vars.datadir ?? vars.data_directory ?? "—"],
                ["Plugins directory", vars.plugin_dir ?? "—"],
                ["Tmp directory", vars.tmpdir ?? "—"],
                ["Error log", vars.log_error ?? "—"],
                ["Config file", String(info?.[4] ?? vars.config_file ?? "unknown")],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="truncate font-mono" title={v}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

function ProcessesView({ connection }: { connection: SavedConnection }) {
  const { results, errors, busy, load } = useAdminQuery(
    connection.engine,
    connection.id,
    "processes",
  );
  const [msg, setMsg] = useState("");

  async function kill(row: unknown[]) {
    const id = Number(row[0]);
    if (!Number.isFinite(id)) return;
    setMsg("");
    try {
      await runSql(
        isMysqlFamily(connection.engine)
          ? `KILL ${id}`
          : `SELECT pg_terminate_backend(${id})`,
        connection.id,
      );
      setMsg(`Killed process ${id}.`);
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        title="Client Connections"
        busy={busy}
        onRefresh={() => void load()}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        {msg ? (
          <Alert>
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
        ) : null}
        {errors[0] ? (
          <Alert variant="destructive">
            <AlertDescription>{errors[0]}</AlertDescription>
          </Alert>
        ) : (
          <AdminTable
            fill
            result={results[0] ?? null}
            actionLabel="Kill"
            action={(row) => (
              <Button
                size="xs"
                variant="destructive"
                disabled={busy}
                onClick={() => void kill(row)}
              >
                <Skull className="size-3" />
                Kill
              </Button>
            )}
          />
        )}
      </div>
    </div>
  );
}

function filterByQueryType(
  result: QueryResult | null,
  filter: QueryTypeFilter,
): QueryResult | null {
  if (!result || filter === "all") return result;
  const idx = result.columns.findIndex(
    (c) => c.toLowerCase() === "query_type",
  );
  if (idx < 0) return result;
  return {
    ...result,
    rows: result.rows.filter(
      (r) => queryTypeBucket(String(r[idx] ?? "")) === filter,
    ),
  };
}

const TYPE_FILTERS: { id: QueryTypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "select", label: "SELECT" },
  { id: "dml", label: "DML" },
  { id: "ddl", label: "DDL" },
  { id: "other", label: "Other" },
];

function QueryMonitorView({ connection }: { connection: SavedConnection }) {
  const [pane, setPane] = useState<"running" | "recent">("running");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [typeFilter, setTypeFilter] = useState<QueryTypeFilter>("all");
  const [msg, setMsg] = useState("");
  const tab: AdminTab =
    pane === "running" ? "queryMonitorRunning" : "queryMonitorRecent";
  const { results, errors, busy, load } = useAdminQuery(
    connection.engine,
    connection.id,
    tab,
  );
  const canKill = connection.permissions.allowDdl;
  const filtered = useMemo(
    () => filterByQueryType(results[0] ?? null, typeFilter),
    [results, typeFilter],
  );

  useEffect(() => {
    if (pane === "running") setAutoRefresh(true);
    else setAutoRefresh(false);
  }, [pane]);

  useEffect(() => {
    if (!autoRefresh || pane !== "running") return;
    const id = window.setInterval(() => {
      void load();
    }, 3000);
    return () => window.clearInterval(id);
  }, [autoRefresh, pane, load]);

  async function kill(row: unknown[]) {
    const id = Number(row[0]);
    if (!Number.isFinite(id)) return;
    setMsg("");
    try {
      await runSql(
        isMysqlFamily(connection.engine)
          ? `KILL ${id}`
          : `SELECT pg_terminate_backend(${id})`,
        connection.id,
      );
      setMsg(`Killed process ${id}.`);
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  }

  return (
    <div
      data-testid="query-monitor"
      className="flex h-full min-h-0 flex-col"
    >
      <PanelHeader
        title="Query Monitor"
        busy={busy}
        onRefresh={() => void load()}
      >
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <Button
            size="xs"
            variant={pane === "running" ? "secondary" : "ghost"}
            onClick={() => setPane("running")}
          >
            Running now
          </Button>
          <Button
            size="xs"
            variant={pane === "recent" ? "secondary" : "ghost"}
            onClick={() => setPane("recent")}
          >
            Recent / top
          </Button>
        </div>
        {pane === "running" ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-3.5 accent-primary"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (3s)
          </label>
        ) : null}
      </PanelHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          {TYPE_FILTERS.map((f) => (
            <Button
              key={f.id}
              size="xs"
              variant={typeFilter === f.id ? "secondary" : "outline"}
              onClick={() => setTypeFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        {msg ? (
          <Alert>
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
        ) : null}
        {errors[0] ? (
          <Alert variant="destructive">
            <AlertDescription>
              {pane === "recent"
                ? `Could not load recent statements. ${isMysqlFamily(connection.engine) ? "Requires performance_schema digests." : "Requires the pg_stat_statements extension."} ${errors[0]}`
                : errors[0]}
            </AlertDescription>
          </Alert>
        ) : (
          <AdminTable
            fill
            result={filtered}
            emptyText={
              pane === "running"
                ? "No non-idle queries right now."
                : "No statement stats yet."
            }
            actionLabel={pane === "running" ? "Kill" : undefined}
            action={
              pane === "running"
                ? (row) => (
                    <Button
                      size="xs"
                      variant="destructive"
                      disabled={busy || !canKill}
                      title={
                        canKill
                          ? "Terminate this session"
                          : "DDL permission required to kill"
                      }
                      onClick={() => void kill(row)}
                    >
                      <Skull className="size-3" />
                      Kill
                    </Button>
                  )
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

function UsersView({ connection }: { connection: SavedConnection }) {
  const engine = connection.engine;
  const { results, errors, busy, load } = useAdminQuery(engine, connection.id, "users");
  const [msg, setMsg] = useState("");
  const [grants, setGrants] = useState<{ who: string; result: QueryResult } | null>(null);
  const [newUser, setNewUser] = useState<{
    user: string;
    host: string;
    password: string;
    grantDb: string;
  } | null>(null);

  async function showGrants(row: unknown[]) {
    const user = String(row[0]);
    const host = isMysqlFamily(engine) ? String(row[1]) : undefined;
    try {
      setGrants({
        who: host ? `${user}@${host}` : user,
        result: await runSql(grantsSql(engine, user, host), connection.id),
      });
    } catch (e) {
      setMsg(String(e));
    }
  }

  async function dropUser(row: unknown[]) {
    const user = String(row[0]);
    const host = isMysqlFamily(engine) ? String(row[1]) : undefined;
    const who = host ? `${user}@${host}` : user;
    if (
      user === connection.config.user &&
      (!host || host === "%" || host === "localhost")
    ) {
      setMsg(`Refusing to drop ${who}: it is the account this connection uses.`);
      return;
    }
    const ok = await confirmNative(`DROP USER ${who}? This cannot be undone.`, {
      title: "Drop user",
      kind: "warning",
    }).catch(() => window.confirm(`DROP USER ${who}?`));
    if (!ok) return;
    try {
      await runSql(dropUserSql(engine, user, host), connection.id);
      setMsg(`Dropped ${who}.`);
      setGrants(null);
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  }

  async function createUser() {
    if (!newUser?.user.trim() || !newUser.password) {
      setMsg("User and password are required.");
      return;
    }
    try {
      await runScript(createUserSql(engine, newUser), connection.id);
      setMsg(`Created ${newUser.user}.`);
      setNewUser(null);
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        title="Users and Privileges"
        busy={busy}
        onRefresh={() => void load()}
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setNewUser({ user: "", host: "%", password: "", grantDb: "" })
          }
        >
          <UserPlus className="size-3.5" />
          New user
        </Button>
      </PanelHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
        {msg ? (
          <Alert>
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
        ) : null}
        {newUser ? (
          <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-4">
            <div className="grid gap-1">
              <Label>User</Label>
              <Input
                value={newUser.user}
                onChange={(e) => setNewUser({ ...newUser, user: e.target.value })}
              />
            </div>
            {isMysqlFamily(engine) ? (
              <div className="grid gap-1">
                <Label>Host</Label>
                <Input
                  value={newUser.host}
                  onChange={(e) =>
                    setNewUser({ ...newUser, host: e.target.value })
                  }
                />
              </div>
            ) : null}
            <div className="grid gap-1">
              <Label>Password</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
              />
            </div>
            <div className="grid gap-1">
              <Label>Grant ALL on database (optional)</Label>
              <Input
                value={newUser.grantDb}
                onChange={(e) =>
                  setNewUser({ ...newUser, grantDb: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2 sm:col-span-4">
              <Button size="sm" onClick={() => void createUser()}>
                Create
              </Button>
              <Button size="sm" variant="outline" onClick={() => setNewUser(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        {errors[0] ? (
          <Alert variant="destructive">
            <AlertDescription>{errors[0]}</AlertDescription>
          </Alert>
        ) : (
          <AdminTable
            fill
            result={results[0] ?? null}
            actionLabel="Actions"
            action={(row) => (
              <span className="flex gap-1">
                <Button size="xs" variant="outline" onClick={() => void showGrants(row)}>
                  Grants
                </Button>
                <Button
                  size="xs"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void dropUser(row)}
                >
                  <UserMinus className="size-3" />
                  Drop
                </Button>
              </span>
            )}
          />
        )}
        {grants ? (
          <div className="flex max-h-56 shrink-0 flex-col gap-1">
            <h3 className="text-xs font-medium text-muted-foreground">
              Grants for {grants.who}
            </h3>
            <AdminTable result={grants.result} emptyText="No grants." />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function VariablesView({ connection }: { connection: SavedConnection }) {
  const statusQ = useAdminQuery(connection.engine, connection.id, "status");
  const varsQ = useAdminQuery(connection.engine, connection.id, "variables");
  const busy = statusQ.busy || varsQ.busy;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        title="Status and System Variables"
        busy={busy}
        onRefresh={() => {
          void statusQ.load();
          void varsQ.load();
        }}
      />
      <div className="grid min-h-0 flex-1 gap-3 overflow-auto p-3 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-1">
          <h3 className="text-xs font-medium text-muted-foreground">
            Global status
          </h3>
          {statusQ.errors[0] ? (
            <Alert variant="destructive">
              <AlertDescription>{statusQ.errors[0]}</AlertDescription>
            </Alert>
          ) : (
            <AdminTable fill result={statusQ.results[0] ?? null} />
          )}
        </div>
        <div className="flex min-h-0 flex-col gap-1">
          <h3 className="text-xs font-medium text-muted-foreground">
            Global variables
          </h3>
          {varsQ.errors[0] ? (
            <Alert variant="destructive">
              <AlertDescription>{varsQ.errors[0]}</AlertDescription>
            </Alert>
          ) : (
            <AdminTable fill result={varsQ.results[0] ?? null} />
          )}
        </div>
      </div>
    </div>
  );
}

function LogsView({ connection }: { connection: SavedConnection }) {
  const { results, errors, busy, load } = useAdminQuery(
    connection.engine,
    connection.id,
    "logs",
  );
  const my = isMysqlFamily(connection.engine);
  const labels = my
    ? [
        "Log-related variables",
        "Recent error log (performance_schema.error_log)",
      ]
    : ["Log settings", "Current log file"];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Server Logs" busy={busy} onRefresh={() => void load()} />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        {results.map((r, i) => (
          <section key={i} className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">
              {labels[i]}
            </h3>
            {errors[i] ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Not available on this server: {errors[i]}
                </AlertDescription>
              </Alert>
            ) : (
              <AdminTable result={r} />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function PerfReportsView({ connection }: { connection: SavedConnection }) {
  const { results, errors, busy, load } = useAdminQuery(
    connection.engine,
    connection.id,
    "performance",
  );
  const my = isMysqlFamily(connection.engine);
  const labels = my
    ? [
        "Server version",
        "Uptime / load",
        "Largest tables",
        "I/O waits",
        "Top statements by total time",
      ]
    : ["Server version / uptime", "Largest tables", "Top statements"];
  const tip = my
    ? "Needs performance_schema enabled on the server."
    : "Needs the pg_stat_statements extension.";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        title="Performance Reports"
        busy={busy}
        onRefresh={() => void load()}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        {results.map((r, i) => (
          <section key={i} className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">
              {labels[i]}
            </h3>
            {errors[i] ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {errors[i]}
                  {i === results.length - 1 ? ` — ${tip}` : ""}
                </AlertDescription>
              </Alert>
            ) : (
              <AdminTable result={r} />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function PerfDashboardView({ connection }: { connection: SavedConnection }) {
  const { results, errors, busy, load } = useAdminQuery(
    connection.engine,
    connection.id,
    "serverStatus",
  );
  const status = kvMap(results[1] ?? null);
  const uptimeSec = Number(status.Uptime ?? NaN);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        title="Performance Dashboard"
        busy={busy}
        onRefresh={() => void load()}
      />
      <div className="space-y-3 overflow-auto p-4">
        {errors.some(Boolean) ? (
          <Alert variant="destructive">
            <AlertDescription>{errors.filter(Boolean).join(" · ")}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="size-4" />
          Live metrics from global status (same source as Server Status).
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard label="Uptime" value={fmtUptime(uptimeSec)} />
          <MetricCard label="Connections" value={status.Threads_connected ?? "—"} />
          <MetricCard label="Threads running" value={status.Threads_running ?? "—"} />
          <MetricCard label="Questions" value={status.Questions ?? "—"} />
          <MetricCard label="Slow queries" value={status.Slow_queries ?? "—"} />
          <MetricCard label="Bytes received" value={status.Bytes_received ?? "—"} />
          <MetricCard label="Bytes sent" value={status.Bytes_sent ?? "—"} />
          <MetricCard label="Com_select" value={status.Com_select ?? "—"} />
        </div>
      </div>
    </div>
  );
}

function PerfSchemaSetupView({ connection }: { connection: SavedConnection }) {
  const { results, errors, busy, load } = useAdminQuery(
    connection.engine,
    connection.id,
    "perfSchemaSetup",
  );
  const my = isMysqlFamily(connection.engine);
  const labels = my
    ? [
        "performance_schema enabled",
        "Consumers",
        "Instruments (sample)",
      ]
    : ["Stats-related settings", "Extensions"];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        title="Performance Schema Setup"
        busy={busy}
        onRefresh={() => void load()}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        <Alert>
          <AlertDescription>
            Read-only view of{" "}
            {my
              ? "performance_schema consumers/instruments"
              : "stats-related settings"}
            . Toggling instruments requires SUPER / SYSTEM_VARIABLES_ADMIN and
            is not done from this client.
          </AlertDescription>
        </Alert>
        {results.map((r, i) => (
          <section key={i} className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">
              {labels[i] ?? `Result ${i + 1}`}
            </h3>
            {errors[i] ? (
              <Alert variant="destructive">
                <AlertDescription>{errors[i]}</AlertDescription>
              </Alert>
            ) : (
              <AdminTable result={r} />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function DataExportView({ actions }: { actions: AdminActions }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Data Export" />
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          Export schema and/or data using the same dump tools as the Objects workspace.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => actions.dumpSchema(false)}>
            <Download className="size-3.5" />
            Dump schema SQL (all tables)
          </Button>
          <Button variant="outline" onClick={() => actions.dumpSchema(true)}>
            <Download className="size-3.5" />
            Dump schema + data
          </Button>
          <Button variant="outline" onClick={() => actions.dumpTables()}>
            Dump selected tables…
          </Button>
        </div>
      </div>
    </div>
  );
}

function DataImportView({ actions }: { actions: AdminActions }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Data Import / Restore" />
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          Restore from a SQL dump file into the current connection.
        </p>
        <Button onClick={() => actions.restoreSql()}>
          <Upload className="size-3.5" />
          Restore SQL file…
        </Button>
      </div>
    </div>
  );
}

function AdminViewBody({
  connection,
  view,
  actions,
}: {
  connection: SavedConnection;
  view: AdminViewId;
  actions: AdminActions;
}) {
  switch (view) {
    case "serverStatus":
      return <ServerStatusView connection={connection} />;
    case "connections":
      return <ProcessesView connection={connection} />;
    case "queryMonitor":
      return <QueryMonitorView connection={connection} />;
    case "users":
      return <UsersView connection={connection} />;
    case "variables":
      return <VariablesView connection={connection} />;
    case "dataExport":
      return <DataExportView actions={actions} />;
    case "dataImport":
      return <DataImportView actions={actions} />;
    case "startupShutdown":
      return (
        <StubView
          title="Startup / Shutdown"
          reason="A SQL client cannot start or stop the mysqld/postgres OS service on the host. Use your OS service manager, Docker, or managed-DB console instead."
        />
      );
    case "logs":
      return <LogsView connection={connection} />;
    case "optionsFile":
      return (
        <StubView
          title="Options File"
          reason="Editing my.cnf / postgresql.conf requires filesystem access on the server host, which this connection does not provide."
        />
      );
    case "perfDashboard":
      return <PerfDashboardView connection={connection} />;
    case "perfReports":
      return <PerfReportsView connection={connection} />;
    case "perfSchemaSetup":
      return <PerfSchemaSetupView connection={connection} />;
  }
}

export function AdminWorkbench({
  connection,
  view,
  actions,
}: {
  connection: SavedConnection;
  view: AdminViewId;
  actions: AdminActions;
}) {
  if (!adminSupported(connection.engine)) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Administration supports MySQL, MariaDB, and PostgreSQL. This connection is{" "}
        {connection.engine}.
      </div>
    );
  }

  return (
    <div
      data-testid="admin-workbench"
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <AdminViewBody connection={connection} view={view} actions={actions} />
    </div>
  );
}
