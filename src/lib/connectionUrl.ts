import type { ConnectionConfig, Engine } from "@/types";

const SCHEME_TO_ENGINE: Record<string, Engine> = {
  sqlite: "sqlite",
  postgres: "postgres",
  postgresql: "postgres",
  mysql: "mysql",
  mariadb: "mariadb",
  mssql: "mssql",
  sqlserver: "mssql",
};

const ENGINE_SCHEME: Record<Engine, string> = {
  sqlite: "sqlite",
  postgres: "postgresql",
  mysql: "mysql",
  mariadb: "mariadb",
  mssql: "mssql",
};

export type ParsedConnectionUrl = {
  engine: Engine;
  config: ConnectionConfig;
};

/** Beekeeper-style URL → engine + config fields */
export function parseConnectionUrl(raw: string): ParsedConnectionUrl {
  const input = raw.trim();
  if (!input) throw new Error("URL is empty");

  // sqlite file paths without scheme
  if (!input.includes("://") && (input.endsWith(".db") || input.endsWith(".sqlite") || input.endsWith(".sqlite3") || input.startsWith("/"))) {
    return { engine: "sqlite", config: { path: input } };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid connection URL");
  }

  const scheme = url.protocol.replace(":", "").toLowerCase();
  const engine = SCHEME_TO_ENGINE[scheme];
  if (!engine) {
    throw new Error(`Unsupported URL scheme: ${scheme}`);
  }

  if (engine === "sqlite") {
    // sqlite:///tmp/x.db → pathname /tmp/x.db
    // sqlite://localhost/tmp/x.db → /tmp/x.db (ignore host)
    let path = decodeURIComponent(url.pathname || "");
    if (url.hostname && url.hostname !== "localhost" && url.hostname !== "") {
      path = `/${url.hostname}${path}`;
    }
    if (!path || path === "/") {
      throw new Error("SQLite URL needs a file path");
    }
    return { engine, config: { path } };
  }

  const port = url.port ? Number(url.port) : defaultPort(engine);
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || null;
  const sslMode = url.searchParams.get("sslmode") ?? url.searchParams.get("ssl") ?? null;

  return {
    engine,
    config: {
      host: url.hostname || "127.0.0.1",
      port,
      user: decodeURIComponent(url.username || "") || null,
      password: decodeURIComponent(url.password || "") || null,
      database,
      sslMode,
    },
  };
}

export function buildConnectionUrl(engine: Engine, config: ConnectionConfig): string {
  if (engine === "sqlite") {
    const path = config.path?.trim() || "";
    if (!path) return "sqlite:///";
    return path.startsWith("/")
      ? `sqlite://${path}`
      : `sqlite:///${path}`;
  }

  const scheme = ENGINE_SCHEME[engine];
  const user = config.user ? encodeURIComponent(config.user) : "";
  const pass = config.password ? encodeURIComponent(config.password) : "";
  const auth =
    user || pass ? `${user}${pass ? `:${pass}` : ""}@` : "";
  const host = config.host?.trim() || "127.0.0.1";
  const port = config.port ?? defaultPort(engine);
  const db = config.database ? `/${encodeURIComponent(config.database)}` : "";
  const ssl = config.sslMode
    ? `?sslmode=${encodeURIComponent(config.sslMode)}`
    : "";
  return `${scheme}://${auth}${host}:${port}${db}${ssl}`;
}

function defaultPort(engine: Engine): number {
  switch (engine) {
    case "postgres":
      return 5432;
    case "mysql":
    case "mariadb":
      return 3306;
    case "mssql":
      return 1433;
    default:
      return 0;
  }
}

export const ACCENT_PRESETS = [
  "#2563eb",
  "#0891b2",
  "#059669",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#db2777",
  "#7c3aed",
  "#4b5563",
];

export const DEFAULT_ACCENT = "#2563eb";
