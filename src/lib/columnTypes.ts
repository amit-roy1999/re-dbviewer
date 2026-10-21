/** Common column types for the Table editor type dropdown (by engine). */

const MYSQL = [
  "INT",
  "INT AUTO_INCREMENT",
  "BIGINT",
  "SMALLINT",
  "TINYINT",
  "TINYINT(1)",
  "DECIMAL(10,2)",
  "FLOAT",
  "DOUBLE",
  "VARCHAR(255)",
  "VARCHAR(50)",
  "CHAR(36)",
  "TEXT",
  "MEDIUMTEXT",
  "LONGTEXT",
  "JSON",
  "BLOB",
  "LONGBLOB",
  "DATE",
  "DATETIME",
  "TIMESTAMP",
  "TIME",
  "BOOLEAN",
];

const POSTGRES = [
  "SERIAL",
  "BIGSERIAL",
  "INTEGER",
  "BIGINT",
  "SMALLINT",
  "NUMERIC(10,2)",
  "REAL",
  "DOUBLE PRECISION",
  "VARCHAR(255)",
  "VARCHAR(50)",
  "TEXT",
  "BOOLEAN",
  "UUID",
  "JSONB",
  "JSON",
  "BYTEA",
  "DATE",
  "TIMESTAMP",
  "TIMESTAMPTZ",
  "TIME",
];

const SQLITE = [
  "INTEGER",
  "REAL",
  "TEXT",
  "BLOB",
  "NUMERIC",
  "BOOLEAN",
  "DATE",
  "DATETIME",
];

const MSSQL = [
  "INT",
  "BIGINT",
  "SMALLINT",
  "TINYINT",
  "BIT",
  "DECIMAL(10,2)",
  "FLOAT",
  "VARCHAR(255)",
  "NVARCHAR(255)",
  "NVARCHAR(MAX)",
  "TEXT",
  "VARBINARY(MAX)",
  "UNIQUEIDENTIFIER",
  "DATE",
  "DATETIME2",
  "DATETIME",
  "TIME",
];

export function columnTypeOptions(engine: string): string[] {
  if (engine === "mysql" || engine === "mariadb") return MYSQL;
  if (engine === "postgres") return POSTGRES;
  if (engine === "mssql") return MSSQL;
  return SQLITE;
}

/** Options for a select: engine list plus current value if missing. */
export function typeSelectOptions(engine: string, current: string): string[] {
  const base = columnTypeOptions(engine);
  const cur = current.trim();
  if (!cur) return base;
  const hit = base.some((t) => t.toLowerCase() === cur.toLowerCase());
  return hit ? base : [cur, ...base];
}
