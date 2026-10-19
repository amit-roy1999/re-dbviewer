import type { TableDetails } from "@/types";
import { quoteIdent } from "@/lib/dbApi";

export type TypeRule = { from: string; to: string };

const isMy = (e: string) => e === "mysql" || e === "mariadb";

/** Editable default rules for a cross-engine copy (matched on the base type, case-insensitive). */
export function defaultTypeMap(target: string): TypeRule[] {
  const r = (pairs: [string, string][]) => pairs.map(([from, to]) => ({ from, to }));
  if (isMy(target))
    return r([
      ["INTEGER", "INT"], ["SERIAL", "INT"], ["BIGSERIAL", "BIGINT"],
      ["BOOLEAN", "TINYINT(1)"], ["BOOL", "TINYINT(1)"], ["BIT", "TINYINT(1)"],
      ["DOUBLE PRECISION", "DOUBLE"], ["REAL", "FLOAT"], ["CHARACTER VARYING", "VARCHAR"],
      ["TIMESTAMPTZ", "DATETIME"], ["TIMESTAMP WITHOUT TIME ZONE", "DATETIME"],
      ["TIMESTAMP WITH TIME ZONE", "DATETIME"], ["DATETIME2", "DATETIME"],
      ["BYTEA", "BLOB"], ["UUID", "CHAR(36)"], ["UNIQUEIDENTIFIER", "CHAR(36)"],
      ["JSONB", "JSON"], ["NVARCHAR", "VARCHAR"], ["NTEXT", "LONGTEXT"], ["MONEY", "DECIMAL(19,4)"],
    ]);
  if (target === "postgres")
    return r([
      ["INT", "INTEGER"], ["TINYINT", "SMALLINT"], ["DATETIME", "TIMESTAMP"], ["DATETIME2", "TIMESTAMP"],
      ["LONGTEXT", "TEXT"], ["MEDIUMTEXT", "TEXT"], ["TINYTEXT", "TEXT"], ["NTEXT", "TEXT"],
      ["BLOB", "BYTEA"], ["LONGBLOB", "BYTEA"], ["DOUBLE", "DOUBLE PRECISION"], ["FLOAT", "REAL"],
      ["BIT", "BOOLEAN"], ["NVARCHAR", "VARCHAR"], ["UNIQUEIDENTIFIER", "UUID"],
    ]);
  if (target === "mssql")
    return r([
      ["BOOLEAN", "BIT"], ["BOOL", "BIT"], ["TEXT", "NVARCHAR(MAX)"], ["LONGTEXT", "NVARCHAR(MAX)"],
      ["TIMESTAMP", "DATETIME2"], ["DATETIME", "DATETIME2"], ["DOUBLE", "FLOAT"],
      ["DOUBLE PRECISION", "FLOAT"], ["BLOB", "VARBINARY(MAX)"], ["BYTEA", "VARBINARY(MAX)"],
      ["UUID", "UNIQUEIDENTIFIER"], ["JSON", "NVARCHAR(MAX)"], ["JSONB", "NVARCHAR(MAX)"],
      ["SERIAL", "INT"], ["INTEGER", "INT"],
    ]);
  return r([["BOOLEAN", "INTEGER"], ["JSONB", "TEXT"], ["UUID", "TEXT"], ["BYTEA", "BLOB"]]);
}

export function mapType(dataType: string, rules: TypeRule[]): string {
  const m = /^\s*([^(]+)\s*(\([^)]*\))?/.exec(dataType) ?? [];
  const base = (m[1] ?? dataType).trim().toUpperCase();
  const rule = rules.find((x) => x.from.trim().toUpperCase() === base && x.to.trim());
  if (!rule) return dataType || "TEXT";
  // keep (length) unless the rule supplies its own
  return rule.to.includes("(") ? rule.to : `${rule.to}${m[2] ?? ""}`;
}

/** CREATE TABLE for a different engine: mapped types, NOT NULL and PK only (defaults/FKs/indexes are not carried). */
export function createTableForTarget(
  targetEngine: string,
  table: string,
  d: TableDetails,
  rules: TypeRule[],
): string {
  const q = (s: string) => quoteIdent(targetEngine, s);
  const lines = d.columns.map(
    (c) => `  ${q(c.name)} ${mapType(c.dataType, rules)}${c.nullable ? "" : " NOT NULL"}`,
  );
  const pk = d.columns.filter((c) => c.isPk).map((c) => q(c.name));
  if (pk.length) lines.push(`  PRIMARY KEY (${pk.join(", ")})`);
  return `CREATE TABLE ${q(table)} (\n${lines.join(",\n")}\n)`;
}
