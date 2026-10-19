import type { EerModel } from "@/lib/eerModel";
import { shortName } from "@/lib/dbApi";

export type Snapshot = Record<string, { name: string; type: string }[]>;

export type Diff = {
  kind:
    | "table only in A"
    | "table only in B"
    | "column only in A"
    | "column only in B"
    | "type differs"
    | "index only in A"
    | "index only in B"
    | "fk only in A"
    | "fk only in B";
  table: string;
  column?: string;
  detail?: string;
};

/** Index / FK names per table (from describe_table); absent for .sql-file snapshots. */
export type Extras = Record<string, { indexes: string[]; fks: string[] }>;

export function extrasFromModel(m: EerModel): Extras {
  const out: Extras = {};
  for (const t of m.tables)
    out[t.name.toLowerCase()] = {
      indexes: t.details.indexes.map((i) => i.name),
      fks: t.details.foreignKeys.map((f) => f.name),
    };
  return out;
}

/** H4: index-name and FK-name differences for tables present on both sides. */
export function compareExtras(a: Extras, b: Extras): Diff[] {
  const diffs: Diff[] = [];
  const only = (x: string[], y: string[]) => {
    const ys = new Set(y.map((n) => n.toLowerCase()));
    return x.filter((n) => !ys.has(n.toLowerCase()));
  };
  for (const t of Object.keys(a).sort()) {
    const o = b[t];
    if (!o) continue;
    for (const n of only(a[t].indexes, o.indexes)) diffs.push({ kind: "index only in A", table: t, detail: n });
    for (const n of only(o.indexes, a[t].indexes)) diffs.push({ kind: "index only in B", table: t, detail: n });
    for (const n of only(a[t].fks, o.fks)) diffs.push({ kind: "fk only in A", table: t, detail: n });
    for (const n of only(o.fks, a[t].fks)) diffs.push({ kind: "fk only in B", table: t, detail: n });
  }
  return diffs;
}

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, "");

export function snapshotFromModel(m: EerModel): Snapshot {
  const out: Snapshot = {};
  for (const t of m.tables)
    out[t.name.toLowerCase()] = t.details.columns.map((c) => ({
      name: c.name,
      type: c.dataType,
    }));
  return out;
}

function unquote(s: string) {
  return s.replace(/^[`"'[]|[`"'\]]$/g, "").replace(/[`"'[\]]/g, "");
}

function splitTop(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** Heuristic CREATE TABLE parser for a saved .sql file (MVP: names + first type token). */
export function snapshotFromSql(sql: string): Snapshot {
  const out: Snapshot = {};
  const re = /create\s+(?:temp(?:orary)?\s+)?table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    let depth = 1;
    let i = re.lastIndex;
    const start = i;
    while (i < sql.length && depth > 0) {
      if (sql[i] === "(") depth++;
      else if (sql[i] === ")") depth--;
      i++;
    }
    const body = sql.slice(start, i - 1);
    const cols: { name: string; type: string }[] = [];
    for (const part of splitTop(body)) {
      const line = part.trim().replace(/\s+/g, " ");
      if (!line || /^(constraint|primary|unique|key|index|foreign|check|fulltext|spatial)\b/i.test(line))
        continue;
      const mm = line.match(/^(`[^`]+`|"[^"]+"|\[[^\]]+\]|\S+)\s*(.*)$/);
      if (!mm) continue;
      const type = (mm[2].match(/^([a-z_ ]+?(?:\([^)]*\))?)(?:\s+(?:not|null|default|primary|unique|check|references|collate|auto_increment|generated)\b|$)/i)?.[1] ?? mm[2].split(" ")[0] ?? "").trim();
      cols.push({ name: unquote(mm[1]), type });
    }
    out[unquote(shortName(m[1])).toLowerCase()] = cols;
  }
  return out;
}

export function compareSnapshots(a: Snapshot, b: Snapshot): Diff[] {
  const diffs: Diff[] = [];
  for (const t of Object.keys(a).sort()) {
    if (!b[t]) {
      diffs.push({ kind: "table only in A", table: t });
      continue;
    }
    const bm = new Map(b[t].map((c) => [c.name.toLowerCase(), c]));
    const am = new Map(a[t].map((c) => [c.name.toLowerCase(), c]));
    for (const [k, c] of am) {
      const o = bm.get(k);
      if (!o) diffs.push({ kind: "column only in A", table: t, column: c.name, detail: c.type });
      else if (norm(o.type) !== norm(c.type))
        diffs.push({ kind: "type differs", table: t, column: c.name, detail: `${c.type} ≠ ${o.type}` });
    }
    for (const [k, c] of bm)
      if (!am.has(k)) diffs.push({ kind: "column only in B", table: t, column: c.name, detail: c.type });
  }
  for (const t of Object.keys(b).sort())
    if (!a[t]) diffs.push({ kind: "table only in B", table: t });
  return diffs;
}
