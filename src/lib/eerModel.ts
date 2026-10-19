import type { ForeignKeyInfo, TableDetails } from "@/types";
import {
  describeTable,
  flattenTables,
  listSchema,
  quoteIdent,
  shortName,
} from "@/lib/dbApi";

export type EerTable = {
  ref: string;
  schema: string;
  name: string;
  details: TableDetails;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type EerModel = { engine: string; tables: EerTable[]; truncated: boolean };

export const EER_BOX_W = 230;
const HEAD = 26;
const ROW = 17;
const GAP = 40;

export async function loadEerModel(
  connectionId: string | null,
  engine: string,
  schema: string | null,
  limit = 80,
): Promise<{ model: EerModel; schemas: string[] }> {
  const nodes = await listSchema(connectionId);
  const schemas = nodes.map((n) => n.name);
  const all = flattenTables(
    nodes.filter((n) => !schema || n.name === schema),
    engine,
  );
  const picked = all.slice(0, limit);
  const tables: EerTable[] = [];
  for (const t of picked) {
    const details = await describeTable(t.ref, connectionId);
    tables.push({
      ref: t.ref,
      schema: t.schema,
      name: t.name,
      details,
      x: 0,
      y: 0,
      w: EER_BOX_W,
      h: HEAD + ROW * Math.max(1, details.columns.length) + 6,
    });
  }
  layoutEer(tables);
  return {
    model: { engine, tables, truncated: all.length > picked.length },
    schemas,
  };
}

/** Masonry layout: drop each table into the currently shortest column. */
export function layoutEer(tables: EerTable[]) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length * 1.3)));
  const heights = new Array<number>(cols).fill(GAP / 2);
  for (const t of tables) {
    let c = 0;
    for (let i = 1; i < cols; i++) if (heights[i] < heights[c]) c = i;
    t.x = GAP / 2 + c * (EER_BOX_W + GAP * 2);
    t.y = heights[c];
    heights[c] += t.h + GAP;
  }
}

export type EerEdge = { from: EerTable; to: EerTable; fk: ForeignKeyInfo };

export function findRefTable(model: EerModel, from: EerTable, ref: string) {
  const bare = shortName(ref).toLowerCase();
  return (
    model.tables.find((t) => t.ref.toLowerCase() === ref.toLowerCase()) ??
    model.tables.find(
      (t) => t.schema === from.schema && t.name.toLowerCase() === bare,
    ) ??
    model.tables.find((t) => t.name.toLowerCase() === bare)
  );
}

export function eerEdges(model: EerModel): EerEdge[] {
  const out: EerEdge[] = [];
  for (const t of model.tables) {
    for (const fk of t.details.foreignKeys) {
      const to = findRefTable(model, t, fk.refTable);
      if (to) out.push({ from: t, to, fk });
    }
  }
  return out;
}

type MergedFk = { name: string; columns: string[]; refTable: string; refColumns: string[] };

function mergeFks(fks: ForeignKeyInfo[]): MergedFk[] {
  const map = new Map<string, MergedFk>();
  for (const fk of fks) {
    const key = `${fk.name}|${fk.refTable}`;
    const m = map.get(key);
    if (m) {
      m.columns.push(...fk.columns);
      m.refColumns.push(...fk.refColumns);
    } else {
      map.set(key, {
        name: fk.name,
        columns: [...fk.columns],
        refTable: fk.refTable,
        refColumns: [...fk.refColumns],
      });
    }
  }
  return [...map.values()];
}

/** Forward engineer: CREATE TABLE (+ FKs + indexes) from the model. */
export function generateCreateSql(model: EerModel): string {
  const eng = model.engine;
  const q = (s: string) => quoteIdent(eng, s);
  const inlineFk = eng === "sqlite";

  // dependency order (cycles fall through in original order)
  const ordered: EerTable[] = [];
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const visit = (t: EerTable) => {
    if (seen.has(t.ref)) return;
    if (visiting.has(t.ref)) return;
    visiting.add(t.ref);
    for (const fk of t.details.foreignKeys) {
      const dep = findRefTable(model, t, fk.refTable);
      if (dep && dep !== t) visit(dep);
    }
    visiting.delete(t.ref);
    seen.add(t.ref);
    ordered.push(t);
  };
  model.tables.forEach(visit);

  const stmts: string[] = [];
  const after: string[] = [];
  for (const t of ordered) {
    const lines = t.details.columns.map((c) => {
      let line = `  ${q(c.name)} ${c.dataType || "TEXT"}`;
      if (!c.nullable) line += " NOT NULL";
      if (c.defaultValue != null && String(c.defaultValue).trim())
        line += ` DEFAULT ${String(c.defaultValue).trim()}`;
      return line;
    });
    const pk = t.details.columns.filter((c) => c.isPk).map((c) => q(c.name));
    if (pk.length) lines.push(`  PRIMARY KEY (${pk.join(", ")})`);
    for (const fk of mergeFks(t.details.foreignKeys)) {
      const target = findRefTable(model, t, fk.refTable);
      const ref = q(target?.ref ?? fk.refTable);
      const body = `FOREIGN KEY (${fk.columns.map(q).join(", ")}) REFERENCES ${ref} (${fk.refColumns.map(q).join(", ")})`;
      if (inlineFk) lines.push(`  ${body}`);
      else
        after.push(
          `ALTER TABLE ${q(t.ref)} ADD CONSTRAINT ${q(fk.name || `fk_${t.name}_${fk.columns.join("_")}`)} ${body};`,
        );
    }
    stmts.push(`CREATE TABLE ${q(t.ref)} (\n${lines.join(",\n")}\n);`);
    for (const ix of t.details.indexes) {
      if (/^primary$/i.test(ix.name) || /autoindex|_pkey$/i.test(ix.name)) continue;
      stmts.push(
        `CREATE ${ix.unique ? "UNIQUE " : ""}INDEX ${q(ix.name)} ON ${q(t.ref)} (${ix.columns.map(q).join(", ")});`,
      );
    }
  }
  return [`-- Generated by re-dbviewer (forward engineer)`, ...stmts, ...after].join("\n\n") + "\n";
}

/** Simple schema checks: tables without a primary key, FKs pointing at tables not in the model. */
export function validateModel(model: EerModel): string[] {
  const out: string[] = [];
  for (const t of model.tables) {
    if (!t.details.columns.some((c) => c.isPk)) out.push(`${t.ref}: no primary key`);
    for (const fk of t.details.foreignKeys) {
      if (!findRefTable(model, t, fk.refTable))
        out.push(
          `${t.ref}: FK ${fk.name || fk.columns.join(",")} references missing table ${fk.refTable}`,
        );
    }
  }
  return out;
}
