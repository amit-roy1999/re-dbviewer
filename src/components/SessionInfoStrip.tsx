import { useEffect, useState } from "react";
import type { SavedConnection } from "@/types";
import { runSql } from "@/lib/dbApi";
import { cn } from "@/lib/utils";

function versionSql(engine: string) {
  if (engine === "sqlite") return "SELECT sqlite_version()";
  if (engine === "mssql") return "SELECT @@VERSION";
  return "SELECT VERSION()";
}

/** Engine / host / user / db / version — compact footer strip by default. */
export function SessionInfoStrip({
  connection,
  database,
  className,
}: {
  connection: SavedConnection;
  /** Overrides config.database (e.g. after USE). */
  database?: string | null;
  className?: string;
}) {
  const [version, setVersion] = useState<string | null>(null);
  const { engine, config } = connection;

  useEffect(() => {
    let dead = false;
    runSql(versionSql(engine), connection.id)
      .then((r) => {
        if (!dead) setVersion(String(r.rows[0]?.[0] ?? "").split("\n")[0]);
      })
      .catch(() => {
        if (!dead) setVersion("n/a");
      });
    return () => {
      dead = true;
    };
  }, [engine, connection.id]);

  const where =
    engine === "sqlite"
      ? config.path
      : config.socketPath
        ? `socket ${config.socketPath}`
        : `${config.host ?? "localhost"}${config.port ? `:${config.port}` : ""}`;

  const db =
    database?.trim() ||
    (engine === "sqlite" ? null : config.database);
  const parts = [
    engine,
    where,
    engine === "sqlite" ? null : config.user,
    db,
    version ?? "…",
  ].filter(Boolean) as string[];

  const title = parts.join(" · ");

  return (
    <div
      className={cn(
        "min-w-0 truncate font-mono text-[10px] text-muted-foreground",
        className,
      )}
      title={title}
    >
      {parts.map((p, i) => (
        <span key={`${i}-${p}`}>
          {i > 0 ? (
            <span className="text-muted-foreground/40"> · </span>
          ) : null}
          {p}
        </span>
      ))}
    </div>
  );
}
