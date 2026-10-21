/** Pure SQL helpers for schema-tree ⋯ actions (Select Top, Duplicate). */

/** Qualify a new bare name in the same schema as `fromRef`. */
export function qualifySibling(
  engine: string,
  fromRef: string,
  newName: string,
): string {
  const i = fromRef.lastIndexOf(".");
  if (i < 0 || engine === "sqlite") return newName;
  return `${fromRef.slice(0, i)}.${newName}`;
}

/** `SELECT TOP 100` / `LIMIT 100` for SQL: Select Top. `quoted` is already engine-quoted. */
export function selectTopSql(engine: string, quoted: string): string {
  if (engine === "mssql") return `SELECT TOP 100 * FROM ${quoted};`;
  return `SELECT * FROM ${quoted}\nLIMIT 100;`;
}

/** CTAS / SELECT INTO for Duplicate…. Both idents must already be quoted. */
export function duplicateTableSql(
  engine: string,
  quotedFrom: string,
  quotedDest: string,
): string {
  if (engine === "mssql") {
    return `SELECT * INTO ${quotedDest} FROM ${quotedFrom}`;
  }
  return `CREATE TABLE ${quotedDest} AS SELECT * FROM ${quotedFrom}`;
}
