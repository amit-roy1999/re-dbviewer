/** Split SQL into statements on `;` outside quotes/comments (simple). */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (inLineComment) {
      cur += c;
      if (c === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      cur += c;
      if (c === "*" && next === "/") {
        cur += "/";
        i += 2;
        inBlockComment = false;
        continue;
      }
      i++;
      continue;
    }
    if (!inSingle && !inDouble) {
      if (c === "-" && next === "-") {
        cur += c;
        inLineComment = true;
        i++;
        continue;
      }
      if (c === "/" && next === "*") {
        cur += c;
        inBlockComment = true;
        i++;
        continue;
      }
    }
    if (c === "'" && !inDouble) {
      inSingle = !inSingle;
      cur += c;
      i++;
      continue;
    }
    if (c === '"' && !inSingle) {
      inDouble = !inDouble;
      cur += c;
      i++;
      continue;
    }
    if (c === ";" && !inSingle && !inDouble) {
      const t = cur.trim();
      if (t) out.push(t);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  const t = cur.trim();
  if (t) out.push(t);
  return out;
}

/**
 * SQL to run: selection if non-empty, else statement containing cursor.
 * `cursor` is a document offset; `selection` is selected text.
 */
export function sqlToExecute(
  full: string,
  selection: string,
  cursor: number,
): string {
  const sel = selection.trim();
  if (sel) return sel.replace(/;+\s*$/, "");

  const statements = splitStatements(full);
  if (statements.length <= 1) {
    return full.trim().replace(/;+\s*$/, "");
  }

  // Map offsets by re-scanning
  let pos = 0;
  let chosen = statements[statements.length - 1] ?? full;
  for (const stmt of statements) {
    const idx = full.indexOf(stmt, pos);
    if (idx < 0) continue;
    const end = idx + stmt.length;
    if (cursor >= idx && cursor <= end + 1) {
      chosen = stmt;
      break;
    }
    if (cursor < idx) {
      chosen = stmt;
      break;
    }
    pos = end;
    chosen = stmt;
  }
  return chosen.replace(/;+\s*$/, "");
}
