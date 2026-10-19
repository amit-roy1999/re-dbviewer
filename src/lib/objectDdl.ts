import type { QueryResult } from "@/types";

function q(engine: string, ident: string): string {
  const c = engine === "mysql" || engine === "mariadb" ? "`" : '"';
  return ident
    .split(".")
    .map((p) => `${c}${p.replace(new RegExp(c, "g"), c + c)}${c}`)
    .join(".");
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

function splitRef(ref: string): { schema: string | null; name: string } {
  const i = ref.lastIndexOf(".");
  return i < 0
    ? { schema: null, name: ref }
    : { schema: ref.slice(0, i), name: ref.slice(i + 1) };
}

export function isMysqlLike(engine: string) {
  return engine === "mysql" || engine === "mariadb";
}

// ---- views -------------------------------------------------------------

/** SQL that returns the view definition in the first cell of the first row. */
export function viewDefinitionSql(engine: string, ref: string): string {
  const { schema, name } = splitRef(ref);
  switch (engine) {
    case "sqlite":
      return `SELECT sql FROM sqlite_master WHERE type = 'view' AND name = ${lit(name)}`;
    case "postgres":
      return `SELECT pg_get_viewdef(${lit(q(engine, ref))}::regclass, true)`;
    case "mssql":
      return `SELECT OBJECT_DEFINITION(OBJECT_ID(${lit(ref)}))`;
    default:
      return `SELECT VIEW_DEFINITION FROM information_schema.VIEWS WHERE TABLE_NAME = ${lit(name)} AND TABLE_SCHEMA = ${schema ? lit(schema) : "DATABASE()"}`;
  }
}

/** Strip `CREATE VIEW x AS` and trailing `;` so only the SELECT body is left. */
export function extractViewBody(raw: string): string {
  let body = raw.trim();
  if (/^create\b/i.test(body)) {
    const m = body.match(/\bas\b\s+([\s\S]*)$/i);
    if (m) body = m[1];
  }
  return body.replace(/;+\s*$/, "").trim();
}

export function buildViewSql(
  engine: string,
  name: string,
  body: string,
  mode: "create" | "alter",
): string {
  const b = body.trim().replace(/;+\s*$/, "");
  const n = q(engine, name.trim());
  if (mode === "create") return `CREATE VIEW ${n} AS\n${b};`;
  if (engine === "sqlite") {
    return `DROP VIEW IF EXISTS ${n};\nCREATE VIEW ${n} AS\n${b};`;
  }
  if (engine === "mssql") return `CREATE OR ALTER VIEW ${n} AS\n${b};`;
  return `CREATE OR REPLACE VIEW ${n} AS\n${b};`;
}

// ---- routines (MySQL / MariaDB) -------------------------------------------

export type RoutineKind = "procedure" | "function";

export type RoutineInfo = { schema: string; name: string; kind: RoutineKind };

export const ROUTINES_SQL =
  "SELECT ROUTINE_SCHEMA, ROUTINE_NAME, ROUTINE_TYPE FROM INFORMATION_SCHEMA.ROUTINES " +
  "WHERE ROUTINE_SCHEMA NOT IN ('mysql','sys','information_schema','performance_schema') " +
  "ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME";

export function routinesFromResult(res: QueryResult): RoutineInfo[] {
  return res.rows.map((r) => ({
    schema: String(r[0]),
    name: String(r[1]),
    kind: String(r[2]).toUpperCase() === "FUNCTION" ? "function" : "procedure",
  }));
}

export function routineTemplate(kind: RoutineKind): string {
  return kind === "procedure"
    ? "()\nBEGIN\n  SELECT 1;\nEND"
    : "() RETURNS INT DETERMINISTIC\nBEGIN\n  RETURN 1;\nEND";
}

export function showCreateRoutineSql(
  engine: string,
  kind: RoutineKind,
  ref: string,
): string {
  return `SHOW CREATE ${kind.toUpperCase()} ${q(engine, ref)}`;
}

/** Text after the routine name from a `SHOW CREATE` statement (params + body). */
export function extractRoutineBody(createSql: string): string {
  const m = createSql.match(
    /^\s*CREATE\s+(?:DEFINER\s*=\s*\S+\s+)?(?:PROCEDURE|FUNCTION)\s+(?:`[^`]+`\.)?(?:`[^`]+`|[\w$]+)\s*([\s\S]*)$/i,
  );
  return (m ? m[1] : createSql).trim();
}

/** Statements to run (sequentially, one `run_sql` each). */
export function buildRoutineStatements(
  engine: string,
  name: string,
  kind: RoutineKind,
  body: string,
  mode: "create" | "alter",
): string[] {
  const n = q(engine, name.trim());
  const create = `CREATE ${kind.toUpperCase()} ${n}${body.trim().startsWith("(") ? "" : " "}${body.trim()}`;
  return mode === "alter"
    ? [`DROP ${kind.toUpperCase()} IF EXISTS ${n}`, create]
    : [create];
}

// ---- schemas ------------------------------------------------------------------

export function createSchemaSql(engine: string, name: string): string | null {
  if (engine === "sqlite") return null;
  return isMysqlLike(engine)
    ? `CREATE DATABASE ${q(engine, name)}`
    : `CREATE SCHEMA ${q(engine, name)}`;
}

export function dropSchemaSql(engine: string, name: string): string | null {
  if (engine === "sqlite") return null;
  return isMysqlLike(engine)
    ? `DROP DATABASE ${q(engine, name)}`
    : `DROP SCHEMA ${q(engine, name)}`;
}

// ---- rename table -----------------------------------------------------------------

export function renameTableSql(
  engine: string,
  table: string,
  newName: string,
): string {
  const n = newName.trim();
  if (engine === "mssql") {
    return `EXEC sp_rename ${lit(table)}, ${lit(n)}`;
  }
  if (isMysqlLike(engine)) {
    const { schema } = splitRef(table);
    return `RENAME TABLE ${q(engine, table)} TO ${q(engine, schema ? `${schema}.${n}` : n)}`;
  }
  return `ALTER TABLE ${q(engine, table)} RENAME TO ${q(engine, n)}`;
}

export function renamedRef(table: string, newName: string): string {
  const { schema } = splitRef(table);
  return schema ? `${schema}.${newName.trim()}` : newName.trim();
}
