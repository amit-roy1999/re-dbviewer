/** Lightweight SQL formatter — keywords uppercased, clauses on new lines. */
const KEYWORDS = new Set(
  [
    "select",
    "from",
    "where",
    "and",
    "or",
    "not",
    "in",
    "is",
    "null",
    "like",
    "between",
    "join",
    "inner",
    "left",
    "right",
    "full",
    "outer",
    "on",
    "as",
    "order",
    "by",
    "group",
    "having",
    "limit",
    "offset",
    "insert",
    "into",
    "values",
    "update",
    "set",
    "delete",
    "create",
    "table",
    "alter",
    "drop",
    "index",
    "view",
    "with",
    "union",
    "all",
    "distinct",
    "case",
    "when",
    "then",
    "else",
    "end",
    "exists",
    "asc",
    "desc",
    "primary",
    "key",
    "foreign",
    "references",
    "default",
    "constraint",
    "unique",
    "check",
    "explain",
    "analyze",
    "pragma",
  ].map((k) => k.toLowerCase()),
);

const BREAK_BEFORE = new Set([
  "select",
  "from",
  "where",
  "and",
  "or",
  "join",
  "inner",
  "left",
  "right",
  "full",
  "outer",
  "on",
  "group",
  "having",
  "order",
  "limit",
  "offset",
  "union",
  "values",
  "set",
]);

export function formatSql(sql: string): string {
  const trimmed = sql.trim();
  if (!trimmed) return sql;

  const tokens: string[] = [];
  let i = 0;
  while (i < trimmed.length) {
    const c = trimmed[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      let j = i + 1;
      while (j < trimmed.length) {
        if (trimmed[j] === q && trimmed[j - 1] !== "\\") {
          j++;
          break;
        }
        j++;
      }
      tokens.push(trimmed.slice(i, j));
      i = j;
      continue;
    }
    if (c === "-" && trimmed[i + 1] === "-") {
      let j = i;
      while (j < trimmed.length && trimmed[j] !== "\n") j++;
      tokens.push(trimmed.slice(i, j));
      i = j;
      continue;
    }
    if (/[(),;.]/.test(c)) {
      tokens.push(c);
      i++;
      continue;
    }
    let j = i;
    while (j < trimmed.length && !/[\s(),;.]/.test(trimmed[j])) j++;
    tokens.push(trimmed.slice(i, j));
    i = j;
  }

  const parts: string[] = [];
  for (let t = 0; t < tokens.length; t++) {
    const raw = tokens[t];
    const lower = raw.toLowerCase();
    const isKw = KEYWORDS.has(lower) && /^[a-z_]+$/i.test(raw);
    // Preserve the author's casing (do not force UPPERCASE keywords).
    const word = raw;

    if (t > 0 && BREAK_BEFORE.has(lower) && isKw) {
      parts.push("\n");
    } else if (t > 0 && raw !== "," && raw !== ")" && tokens[t - 1] !== "(") {
      if (tokens[t - 1] !== "." && raw !== ".") parts.push(" ");
    }

    parts.push(word);
    if (raw === ",") parts.push("\n  ");
  }

  return parts.join("").replace(/\n{3,}/g, "\n\n").trim() + (trimmed.endsWith(";") ? ";" : "");
}
