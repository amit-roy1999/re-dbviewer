import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Skull, UserMinus, UserPlus } from "lucide-react";
import { confirm as confirmNative } from "@tauri-apps/plugin-dialog";
import type { QueryResult, SavedConnection } from "@/types";
import { runScript, runSql } from "@/lib/dbApi";
import {
  adminSql,
  adminSupported,
  createUserSql,
  dropUserSql,
  grantsSql,
  isMysqlFamily,
  type AdminTab,
} from "@/lib/adminSql";
import { AdminTable } from "@/components/tools/AdminTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "processes", label: "Processes" },
  { id: "status", label: "Status" },
  { id: "variables", label: "Variables" },
  { id: "users", label: "Users" },
  { id: "performance", label: "Performance" },
  { id: "logs", label: "Logs" },
];

export function AdminPanel({ connection }: { connection: SavedConnection }) {
  const engine = connection.engine;
  const [tab, setTab] = useState<AdminTab>("processes");
  const [results, setResults] = useState<(QueryResult | null)[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [grants, setGrants] = useState<{ who: string; result: QueryResult } | null>(null);
  const [newUser, setNewUser] = useState<{
    user: string;
    host: string;
    password: string;
    grantDb: string;
  } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setMsg("");
    setGrants(null);
    const sqls = adminSql(engine, tab);
    const res: (QueryResult | null)[] = [];
    const errs: string[] = [];
    for (const sql of sqls) {
      try {
        res.push(await runSql(sql, connection.id));
        errs.push("");
      } catch (e) {
        res.push(null);
        errs.push(String(e));
      }
    }
    setResults(res);
    setErrors(errs);
    setBusy(false);
  }, [engine, tab, connection.id]);

  useEffect(() => {
    if (adminSupported(engine)) void load();
  }, [load, engine]);

  if (!adminSupported(engine)) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Admin tools support MySQL, MariaDB and PostgreSQL connections. This
        connection is {engine}.
      </p>
    );
  }

  async function kill(row: unknown[]) {
    const id = Number(row[0]);
    if (!Number.isFinite(id)) return;
    setBusy(true);
    try {
      await runSql(
        isMysqlFamily(engine)
          ? `KILL ${id}`
          : `SELECT pg_terminate_backend(${id})`,
        connection.id,
      );
      setMsg(`Killed process ${id}.`);
      await load();
    } catch (e) {
      setMsg(String(e));
      setBusy(false);
    }
  }

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
    if (user === connection.config.user && (!host || host === "%" || host === "localhost")) {
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

  const my = isMysqlFamily(engine);
  const perfLabels = my
    ? [
        "Server version",
        "Uptime / load (SHOW GLOBAL STATUS)",
        "Largest tables (information_schema)",
        "I/O waits (performance_schema)",
        "Top statements by total time (performance_schema digests)",
      ]
    : [
        "Server version / uptime",
        "Largest tables (pg_stat_user_tables)",
        "Top statements by total time (pg_stat_statements)",
      ];
  const perfTip = my
    ? "Needs performance_schema enabled on the server."
    : "Needs the pg_stat_statements extension (shared_preload_libraries + CREATE EXTENSION pg_stat_statements).";
  const logLabels = my
    ? [
        "Log-related variables (log_error / general_log_file / slow_query_log_file show file paths)",
        "Recent error log (performance_schema.error_log)",
      ]
    : [
        "Log settings (pg_settings)",
        "Current log file (relative to data_directory / log_directory)",
      ];
  const labels = tab === "performance" ? perfLabels : tab === "logs" ? logLabels : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? "default" : "outline"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
          Refresh
        </Button>
        {tab === "users" ? (
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
        ) : null}
      </div>

      {msg ? (
        <Alert>
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      ) : null}

      {newUser ? (
        <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-4">
          <div className="grid gap-1">
            <Label>User</Label>
            <Input value={newUser.user} onChange={(e) => setNewUser({ ...newUser, user: e.target.value })} />
          </div>
          {isMysqlFamily(engine) ? (
            <div className="grid gap-1">
              <Label>Host</Label>
              <Input value={newUser.host} onChange={(e) => setNewUser({ ...newUser, host: e.target.value })} />
            </div>
          ) : null}
          <div className="grid gap-1">
            <Label>Password</Label>
            <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label>Grant ALL on database (optional)</Label>
            <Input value={newUser.grantDb} onChange={(e) => setNewUser({ ...newUser, grantDb: e.target.value })} />
          </div>
          <div className="flex gap-2 sm:col-span-4">
            <Button size="sm" onClick={() => void createUser()}>Create</Button>
            <Button size="sm" variant="outline" onClick={() => setNewUser(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {results.map((r, i) => (
        <div key={i} className="flex min-h-0 flex-1 flex-col gap-1">
          {labels[i] ? (
            <h3 className="text-xs font-medium text-muted-foreground">
              {labels[i]}
            </h3>
          ) : null}
          {errors[i] ? (
            <Alert variant="destructive">
              <AlertDescription>
                {tab === "logs" ? "Not available on this server: " : ""}
                {errors[i]}
                {tab === "performance" && i === results.length - 1 ? ` — ${perfTip}` : ""}
              </AlertDescription>
            </Alert>
          ) : (
            <AdminTable
              result={r}
              actionLabel={tab === "processes" ? "Kill" : tab === "users" ? "Actions" : undefined}
              action={
                tab === "processes"
                  ? (row) => (
                      <Button size="xs" variant="destructive" disabled={busy} onClick={() => void kill(row)}>
                        <Skull className="size-3" />
                        Kill
                      </Button>
                    )
                  : tab === "users"
                    ? (row) => (
                        <span className="flex gap-1">
                          <Button size="xs" variant="outline" onClick={() => void showGrants(row)}>
                            Grants
                          </Button>
                          <Button size="xs" variant="destructive" disabled={busy} onClick={() => void dropUser(row)}>
                            <UserMinus className="size-3" />
                            Drop
                          </Button>
                        </span>
                      )
                    : undefined
              }
            />
          )}
        </div>
      ))}

      {grants ? (
        <div className="flex max-h-56 min-h-0 flex-col gap-1">
          <h3 className="text-xs font-medium text-muted-foreground">
            Grants for {grants.who}
          </h3>
          <AdminTable result={grants.result} emptyText="No grants." />
        </div>
      ) : null}
    </div>
  );
}
