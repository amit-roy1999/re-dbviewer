export type Engine = "sqlite" | "postgres" | "mysql" | "mariadb" | "mssql";

export type ConnectionConfig = {
  path?: string | null;
  host?: string | null;
  port?: number | null;
  user?: string | null;
  password?: string | null;
  database?: string | null;
  sslMode?: string | null;
  sslCert?: string | null;
  sslKey?: string | null;
  sslCa?: string | null;
  socketPath?: string | null;
  sshHost?: string | null;
  sshPort?: number | null;
  sshUser?: string | null;
  sshKeyPath?: string | null;
  /** Set by the backend when the password lives in the OS keyring. */
  passwordInKeyring?: boolean;
  /** Set by the backend when the password lives in the encrypted app vault. */
  passwordInVault?: boolean;
  /** When false on save, clear any stored password (default true). */
  storePassword?: boolean;
  /** Production-safe: always confirm destructive / write SQL. */
  safeMode?: boolean;
  /** Prefer keys from ssh-agent (BatchMode; key must already be loaded). */
  sshUseAgent?: boolean;
};

export type VaultStatus = {
  exists: boolean;
  unlocked: boolean;
  keyringAvailable: boolean;
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

export type ColumnInfo = {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPk: boolean;
  /** Present when the column is generated (expression or engine EXTRA). */
  generated?: string | null;
};

export type CheckConstraintInfo = {
  name: string;
  definition: string;
};

export type ForeignKeyInfo = {
  name: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
};

export type IndexInfo = {
  name: string;
  unique: boolean;
  columns: string[];
};

export type TableDetails = {
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  indexes: IndexInfo[];
  checkConstraints?: CheckConstraintInfo[];
};

export type FilterOp =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "is_null"
  | "is_not_null";

export type FilterJoin = "and" | "or";

export type TableFilter = {
  column: string;
  op: FilterOp;
  value?: string | null;
  /** How this row joins the previous one. Ignored on the first row. */
  join?: FilterJoin;
};

export type TableSort = {
  column: string;
  desc: boolean;
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
  if (c.config.socketPath) return `socket ${c.config.socketPath}`;
  const host = c.config.host ?? "localhost";
  const port = c.config.port ?? "";
  const db = c.config.database ?? "";
  return `${host}${port ? `:${port}` : ""}${db ? ` / ${db}` : ""}`;
}
