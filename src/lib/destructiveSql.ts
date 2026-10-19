/** True for DROP / TRUNCATE / DELETE statements (comments ignored). */
export function isDestructiveSql(stmt: string): boolean {
  const text = stmt
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .trim();
  return /^(drop|truncate|delete)\b/i.test(text);
}
