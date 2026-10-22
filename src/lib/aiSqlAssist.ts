/**
 * Opt-in SQL assist — local heuristics only (no network).
 * Enable via Preferences; never phones home.
 */

export function suggestSql(prompt: string, engine: string): string {
  const p = prompt.trim().toLowerCase();
  const q = (s: string) =>
    engine === "mysql" || engine === "mariadb" ? `\`${s}\`` : `"${s}"`;
  if (/list tables|show tables/.test(p)) {
    if (engine === "sqlite") return "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;";
    if (engine === "postgres") return "SELECT schemaname, tablename FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2;";
    return "SHOW TABLES;";
  }
  if (/count|how many/.test(p)) {
    const m = /(?:from|of|in)\s+([a-zA-Z0-9_.]+)/.exec(p);
    const t = m?.[1] ?? "my_table";
    return `SELECT COUNT(*) AS n FROM ${q(t)};`;
  }
  if (/top\s+(\d+)/.test(p) || /limit\s+(\d+)/.test(p)) {
    const n = Number(/(\d+)/.exec(p)?.[1] ?? 10);
    const m = /(?:from|of)\s+([a-zA-Z0-9_.]+)/.exec(p);
    const t = m?.[1] ?? "my_table";
    return `SELECT * FROM ${q(t)} LIMIT ${n};`;
  }
  return `-- AI assist (local templates): describe list tables / count / top N\n-- Engine: ${engine}\nSELECT 1;`;
}
