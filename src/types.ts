export type Engine = "sqlite" | "postgres" | "mysql" | "mariadb" | "mssql";

export type ConnectionConfig = {
  path?: string | null;
  host?: string | null;
  port?: number | null;
  user?: string | null;
  password?: string | null;
  database?: string | null;
  sslMode?: string | null;
};

export type Permissions = {
  allowSelect: boolean;
  allowInsert: boolean;
  allowUpdate: boolean;
  allowDelete: boolean;
  allowDdl: boolean;
};

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
};

export type SavedConnection = {
  id: string;
  name: string;
  engine: Engine | string;
  categoryId: string | null;
  categoryName: string | null;
  isFavorite: boolean;
  accentColor: string;
  config: ConnectionConfig;
  permissions: Permissions;
};

export type SchemaNode = {
  name: string;
  kind: string;
  children: SchemaNode[];
};

export type QueryResult = {
  columns: string[];
  rows: unknown[][];
  rowsAffected: number | null;
};

export const FULL_PERMISSIONS: Permissions = {
  allowSelect: true,
  allowInsert: true,
  allowUpdate: true,
  allowDelete: true,
  allowDdl: true,
};

export function isRestricted(p: Permissions): boolean {
  return !(
    p.allowSelect &&
    p.allowInsert &&
    p.allowUpdate &&
    p.allowDelete &&
    p.allowDdl
  );
}

export function connectionSummary(c: SavedConnection): string {
  if (c.engine === "sqlite") {
    return c.config.path ?? "";
  }
  const host = c.config.host ?? "localhost";
  const port = c.config.port ?? "";
  const db = c.config.database ?? "";
  return `${host}${port ? `:${port}` : ""}${db ? ` / ${db}` : ""}`;
}
