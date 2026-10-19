import type { ForeignKeyInfo, TableDetails } from "@/types";
import { shortName } from "@/lib/dbApi";

export type FakeWriteMode = "append" | "truncateFill";

export type FakeColumnSpec = {
  name: string;
  kind: string;
  value?: string;
  min?: number;
  max?: number;
  len?: number;
  values?: string[];
  refTable?: string;
  refColumn?: string;
  start?: number;
  step?: number;
  dataType?: string;
  /** Single-column UNIQUE / PK — FK values are assigned without replacement. */
  unique?: boolean;
};

export type FakeTableSpec = {
  table: string;
  rowCount: number;
  columns: FakeColumnSpec[];
};

export type FakeDataPlan = {
  mode: FakeWriteMode;
  seed?: number;
  tables: FakeTableSpec[];
};

export type FakeDataResult = {
  tables: number;
  rows: number;
  log: string[];
};

export const GENERATOR_KINDS = [
  "auto",
  "skip",
  "null",
  "fixed",
  "uuid",
  "bool",
  "int",
  "float",
  "sequence",
  "string",
  "lorem",
  "email",
  "fullName",
  "firstName",
  "lastName",
  "phone",
  "company",
  "date",
  "datetime",
  "enum",
  "fk",
] as const;

/** Short labels for the kind dropdown. */
export const GENERATOR_LABELS: Record<(typeof GENERATOR_KINDS)[number], string> = {
  auto: "Auto (from type)",
  skip: "Skip (DB default)",
  null: "NULL",
  fixed: "Fixed value",
  uuid: "UUID",
  bool: "Boolean",
  int: "Random integer",
  float: "Random number",
  sequence: "Sequence (1, 2, …)",
  string: "Random string",
  lorem: "Lorem text",
  email: "Email",
  fullName: "Full name",
  firstName: "First name",
  lastName: "Last name",
  phone: "Phone",
  company: "Company",
  date: "Date",
  datetime: "Date & time",
  enum: "Pick from list",
  fk: "Foreign key",
};

export const ROW_PRESETS = [10, 50, 100, 500, 1000] as const;

export function kindLabel(kind: string): string {
  return (GENERATOR_LABELS as Record<string, string>)[kind] ?? kind;
}

function qualifyRef(childTable: string | undefined, ref: string): string {
  if (!childTable || ref.includes(".")) return ref;
  const schema = childTable.includes(".")
    ? childTable.split(".").slice(0, -1).join(".")
    : null;
  return schema ? `${schema}.${ref}` : ref;
}

function shortTable(t: string): string {
  return t.includes(".") ? (t.split(".").pop() ?? t) : t;
}

/** Mirror Rust default_columns_from_details for the UI. */
export function defaultColumnsFromDetails(
  details: TableDetails,
  tableRef?: string,
): FakeColumnSpec[] {
  const uniques = new Set<string>();
  for (const c of details.columns) {
    if (c.isPk) uniques.add(c.name);
  }
  for (const ix of details.indexes) {
    if (ix.unique && ix.columns.length === 1) uniques.add(ix.columns[0]);
  }

  return details.columns.map((c) => {
    let kind = "auto";
    const dt = c.dataType.toLowerCase();
    if (c.isPk && (dt.includes("int") || dt.includes("serial"))) {
      kind = "sequence";
    }
    let refTable: string | undefined;
    let refColumn: string | undefined;
    for (const fk of details.foreignKeys) {
      const i = fk.columns.indexOf(c.name);
      if (i >= 0) {
        kind = "fk";
        refTable = qualifyRef(tableRef, fk.refTable);
        refColumn = fk.refColumns[i] ?? "id";
        break;
      }
    }
    return {
      name: c.name,
      kind,
      value: kind === "auto" && dt.includes("json") ? "{}" : undefined,
      start: 1,
      step: 1,
      dataType: c.dataType,
      refTable,
      refColumn,
      unique: uniques.has(c.name),
    };
  });
}

/** Parent tables referenced by FK columns but not in the selection. */
export function missingFkParents(
  selected: string[],
  specs: Record<string, FakeTableSpec>,
): string[] {
  const set = new Set(selected);
  const missing = new Set<string>();
  for (const t of selected) {
    const spec = specs[t];
    if (!spec) continue;
    for (const c of spec.columns) {
      if (c.kind !== "fk" || !c.refTable) continue;
      const ref = c.refTable;
      const inPlan =
        set.has(ref) ||
        [...set].some((s) => shortTable(s) === shortTable(ref));
      if (!inPlan) missing.add(qualifyRef(t, ref));
    }
  }
  return [...missing];
}

export function relatedTableRefs(
  table: string,
  details: TableDetails,
  inboundFrom: { fromTable: string }[] = [],
): string[] {
  const out = new Set<string>();
  const schema = table.includes(".") ? table.split(".").slice(0, -1).join(".") : null;
  const resolve = (ref: string) => {
    if (ref.includes(".")) return ref;
    return schema ? `${schema}.${ref}` : ref;
  };
  for (const fk of details.foreignKeys) {
    out.add(resolve(fk.refTable));
  }
  for (const i of inboundFrom) {
    out.add(i.fromTable);
  }
  out.delete(table);
  out.delete(shortName(table));
  return [...out];
}

export function applyFkHints(
  columns: FakeColumnSpec[],
  foreignKeys: ForeignKeyInfo[],
): FakeColumnSpec[] {
  return columns.map((c) => {
    for (const fk of foreignKeys) {
      const i = fk.columns.indexOf(c.name);
      if (i >= 0) {
        return {
          ...c,
          kind: "fk",
          refTable: fk.refTable,
          refColumn: fk.refColumns[i] ?? "id",
        };
      }
    }
    return c;
  });
}
