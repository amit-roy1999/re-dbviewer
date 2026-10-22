function stripSqlComments(stmt: string): string {
  return stmt
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .trim();
}

/** True for DROP / TRUNCATE / DELETE statements (comments ignored). */
export function isDestructiveSql(stmt: string): boolean {
  return /^(drop|truncate|delete)\b/i.test(stripSqlComments(stmt));
}

/** Safe-mode confirms: destructive plus INSERT / UPDATE / REPLACE. */
export function isSafeModeConfirmSql(stmt: string): boolean {
  return /^(drop|truncate|delete|insert|update|replace)\b/i.test(
    stripSqlComments(stmt),
  );
}
