import type {
  ColumnInfo,
  Engine,
  ForeignKeyInfo,
  IndexInfo,
} from "@/types";

export type EditableColumn = {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string;
  isPk: boolean;
  /** Name when the table was loaded; undefined for columns added in the editor. */
  origName?: string;
};

export type EditableIndex = {
  name: string;
  unique: boolean;
  /** Comma-separated column list. */
  columns: string;
  /** Primary-key / auto indexes: shown but never altered. */
  locked?: boolean;
};

export type EditableFk = {
  /** Blank = auto-generate on create. */
  name: string;
  columns: string;
  refTable: string;
  refColumns: string;
};

export function columnsToEditable(cols: ColumnInfo[]): EditableColumn[] {
  return cols.map((c) => ({
    name: c.name,
    origName: c.name,
    dataType: c.dataType || "TEXT",
    nullable: c.nullable,
    defaultValue: c.defaultValue ?? "",
    isPk: c.isPk,
  }));
}

export function isSystemIndex(name: string): boolean {
  return /^primary$/i.test(name) || /^sqlite_autoindex/i.test(name) || /_pkey$/i.test(name);
}

export function indexesToEditable(idx: IndexInfo[]): EditableIndex[] {
  return idx.map((i) => ({
    name: i.name,
    unique: i.unique,
    columns: i.columns.join(", "),
    locked: isSystemIndex(i.name),
  }));
}

export function fksToEditable(fks: ForeignKeyInfo[]): EditableFk[] {
  return fks.map((f) => ({
    name: f.name,
    columns: f.columns.join(", "),
    refTable: f.refTable,
    refColumns: f.refColumns.join(", "),
  }));
}

function quote(engine: string, ident: string): string {
  const q = engine === "mysql" || engine === "mariadb" ? "`" : '"';
  return ident
    .split(".")
    .map((p) => `${q}${p.replace(new RegExp(q, "g"), q + q)}${q}`)
    .join(".");
}

function list(s: string): string[] {
  return s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function quoteList(engine: string, s: string): string {
  return list(s)
    .map((c) => quote(engine, c))
    .join(", ");
}

function shortName(table: string): string {
  const i = table.lastIndexOf(".");
  return i >= 0 ? table.slice(i + 1) : table;
}

function autoName(prefix: string, table: string, cols: string): string {
  return `${prefix}_${shortName(table)}_${list(cols).join("_")}`.replace(
    /[^\w]+/g,
    "_",
  );
}

function columnDef(c: EditableColumn): string {
  let def = c.dataType || "TEXT";
  if (!c.nullable) def += " NOT NULL";
  if (c.defaultValue.trim()) def += ` DEFAULT ${c.defaultValue.trim()}`;
  return def;
}

function createIndexSql(
  engine: string,
  table: string,
  ix: EditableIndex,
): string {
  const name = ix.name.trim() || autoName("idx", table, ix.columns);
  return `CREATE ${ix.unique ? "UNIQUE " : ""}INDEX ${quote(engine, name)} ON ${quote(engine, table)} (${quoteList(engine, ix.columns)});`;
}

function dropIndexSql(engine: string, table: string, name: string): string {
  return engine === "mysql" || engine === "mariadb" || engine === "mssql"
    ? `DROP INDEX ${quote(engine, name)} ON ${quote(engine, table)};`
    : `DROP INDEX ${quote(engine, name)};`;
}

function fkClause(engine: string, table: string, fk: EditableFk): string {
  const name = fk.name.trim() || autoName("fk", table, fk.columns);
  return `CONSTRAINT ${quote(engine, name)} FOREIGN KEY (${quoteList(engine, fk.columns)}) REFERENCES ${quote(engine, fk.refTable)} (${quoteList(engine, fk.refColumns)})`;
}

function validFk(fk: EditableFk): boolean {
  return (
    list(fk.columns).length > 0 &&
    fk.refTable.trim() !== "" &&
    list(fk.refColumns).length > 0
  );
}

/** Generate CREATE TABLE (+ CREATE INDEX statements) for a new table. */
export function buildCreateTableSql(
  engine: string,
  table: string,
  columns: EditableColumn[],
  fks: EditableFk[] = [],
  indexes: EditableIndex[] = [],
): string {
  if (!columns.length) throw new Error("Add at least one column");
  const pk = columns.filter((c) => c.isPk).map((c) => quote(engine, c.name));
  const lines = columns.map(
    (c) => `  ${quote(engine, c.name)} ${columnDef(c)}`,
  );
  if (pk.length) {
    lines.push(`  PRIMARY KEY (${pk.join(", ")})`);
  }
  for (const fk of fks.filter(validFk)) {
    lines.push(`  ${fkClause(engine, table, fk)}`);
  }
  const out = [`CREATE TABLE ${quote(engine, table)} (\n${lines.join(",\n")}\n);`];
  for (const ix of indexes) {
    if (ix.locked || !list(ix.columns).length) continue;
    out.push(createIndexSql(engine, table, ix));
  }
  return out.join("\n");
}

/** True when the DDL has at least one non-comment line. */
export function hasExecutableSql(ddl: string): boolean {
  return ddl
    .split("\n")
    .some((l) => l.trim() !== "" && !l.trim().startsWith("--"));
}

/** Drop `--` comment lines (backend rejects comment-only statements). */
export function stripCommentLines(ddl: string): string {
  return ddl
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
}

function alterColumnsSql(
  engine: string,
  table: string,
  original: EditableColumn[],
  next: EditableColumn[],
): string[] {
  const t = quote(engine, table);
  const my = engine === "mysql" || engine === "mariadb";
  const origByName = new Map(original.map((c) => [c.name, c]));
  const keep = new Set<string>();
  const out: string[] = [];
  const sqlite = engine === "sqlite";
  const mssql = engine === "mssql";

  for (const c of next) {
    if (!c.name.trim()) continue;
    const o = c.origName != null ? origByName.get(c.origName) : undefined;
    if (!o) {
      out.push(
        `ALTER TABLE ${t} ADD ${mssql ? "" : "COLUMN "}${quote(engine, c.name)} ${columnDef(c)};`,
      );
      continue;
    }
    keep.add(o.name);
    const renamed = o.name !== c.name;
    const typeChanged =
      o.dataType.trim().toLowerCase() !== c.dataType.trim().toLowerCase();
    const nullChanged = o.nullable !== c.nullable;
    const defChanged = o.defaultValue.trim() !== c.defaultValue.trim();
    const defChange = typeChanged || nullChanged || defChanged;

    if (my) {
      if (renamed) {
        out.push(
          `ALTER TABLE ${t} CHANGE COLUMN ${quote(engine, o.name)} ${quote(engine, c.name)} ${columnDef(c)};`,
        );
      } else if (defChange) {
        out.push(
          `ALTER TABLE ${t} MODIFY COLUMN ${quote(engine, c.name)} ${columnDef(c)};`,
        );
      }
      continue;
    }

    if (renamed) {
      out.push(
        mssql
          ? `EXEC sp_rename '${table.replace(/'/g, "''")}.${o.name.replace(/'/g, "''")}', '${c.name.replace(/'/g, "''")}', 'COLUMN';`
          : `ALTER TABLE ${t} RENAME COLUMN ${quote(engine, o.name)} TO ${quote(engine, c.name)};`,
      );
    }
    if (!defChange) continue;
    const col = quote(engine, c.name);
    if (sqlite) {
      out.push(
        `-- SQLite cannot change type/null/default of ${c.name} with ALTER; recreate the table.`,
      );
    } else if (mssql) {
      if (typeChanged || nullChanged) {
        out.push(
          `ALTER TABLE ${t} ALTER COLUMN ${col} ${c.dataType || "TEXT"} ${c.nullable ? "NULL" : "NOT NULL"};`,
        );
      }
      if (defChanged) {
        out.push(
          `-- SQL Server default of ${c.name} is a named constraint; change it in a Query tab.`,
        );
      }
    } else {
      if (typeChanged) {
        out.push(
          `ALTER TABLE ${t} ALTER COLUMN ${col} TYPE ${c.dataType} USING ${col}::${c.dataType};`,
        );
      }
      if (nullChanged) {
        out.push(
          `ALTER TABLE ${t} ALTER COLUMN ${col} ${c.nullable ? "DROP" : "SET"} NOT NULL;`,
        );
      }
      if (defChanged) {
        out.push(
          c.defaultValue.trim()
            ? `ALTER TABLE ${t} ALTER COLUMN ${col} SET DEFAULT ${c.defaultValue.trim()};`
            : `ALTER TABLE ${t} ALTER COLUMN ${col} DROP DEFAULT;`,
        );
      }
    }
  }

  for (const o of original) {
    if (!keep.has(o.name)) {
      out.push(`ALTER TABLE ${t} DROP COLUMN ${quote(engine, o.name)};`);
    }
  }

  const pkKey = (cols: EditableColumn[]) =>
    cols
      .filter((c) => c.isPk)
      .map((c) => c.origName ?? c.name)
      .sort()
      .join(",");
  if (pkKey(original) !== pkKey(next)) {
    out.push(
      "-- Primary key changes are not applied automatically; use a Query tab.",
    );
  }
  return out;
}

const sameList = (a: string, b: string) =>
  list(a).join("\u0000").toLowerCase() === list(b).join("\u0000").toLowerCase();

function alterIndexesSql(
  engine: string,
  table: string,
  original: EditableIndex[],
  next: EditableIndex[],
): string[] {
  const out: string[] = [];
  const o = original.filter((i) => !i.locked);
  const n = next.filter((i) => !i.locked && list(i.columns).length > 0);
  const nextByName = new Map(n.filter((i) => i.name.trim()).map((i) => [i.name, i]));
  const origByName = new Map(o.map((i) => [i.name, i]));
  for (const ix of o) {
    const m = nextByName.get(ix.name);
    if (!m || m.unique !== ix.unique || !sameList(m.columns, ix.columns)) {
      out.push(dropIndexSql(engine, table, ix.name));
    }
  }
  for (const ix of n) {
    const prev = ix.name.trim() ? origByName.get(ix.name) : undefined;
    if (!prev || prev.unique !== ix.unique || !sameList(prev.columns, ix.columns)) {
      out.push(createIndexSql(engine, table, ix));
    }
  }
  return out;
}

function alterFksSql(
  engine: string,
  table: string,
  original: EditableFk[],
  next: EditableFk[],
): string[] {
  const out: string[] = [];
  const t = quote(engine, table);
  const n = next.filter(validFk);
  const nextByName = new Map(n.filter((f) => f.name.trim()).map((f) => [f.name, f]));
  const origByName = new Map(original.map((f) => [f.name, f]));
  const same = (a: EditableFk, b: EditableFk) =>
    sameList(a.columns, b.columns) &&
    a.refTable.trim() === b.refTable.trim() &&
    sameList(a.refColumns, b.refColumns);
  const sqlite = engine === "sqlite";
  const my = engine === "mysql" || engine === "mariadb";
  let warned = false;
  const unsupported = () => {
    if (!warned) {
      out.push(
        "-- SQLite cannot add/drop foreign keys with ALTER; recreate the table.",
      );
      warned = true;
    }
  };
  for (const fk of original) {
    const m = nextByName.get(fk.name);
    if (!m || !same(m, fk)) {
      if (sqlite) unsupported();
      else
        out.push(
          my
            ? `ALTER TABLE ${t} DROP FOREIGN KEY ${quote(engine, fk.name)};`
            : `ALTER TABLE ${t} DROP CONSTRAINT ${quote(engine, fk.name)};`,
        );
    }
  }
  for (const fk of n) {
    const prev = fk.name.trim() ? origByName.get(fk.name) : undefined;
    if (!prev || !same(prev, fk)) {
      if (sqlite) unsupported();
      else out.push(`ALTER TABLE ${t} ADD ${fkClause(engine, table, fk)};`);
    }
  }
  return out;
}

export type TableEditState = {
  columns: EditableColumn[];
  indexes: EditableIndex[];
  fks: EditableFk[];
};

/**
 * Full ALTER script: add / rename / retype / drop columns, plus index and
 * foreign-key changes. Engine-specific syntax; unsupported actions become comments.
 */
export function buildAlterSql(
  engine: string,
  table: string,
  original: TableEditState,
  next: TableEditState,
): string {
  const stmts = [
    ...alterColumnsSql(engine, table, original.columns, next.columns),
    ...alterFksSql(engine, table, original.fks, next.fks),
    ...alterIndexesSql(engine, table, original.indexes, next.indexes),
  ];
  return stmts.length ? stmts.join("\n") : "-- No changes.";
}

export function emptyIndex(): EditableIndex {
  return { name: "", unique: false, columns: "" };
}

export function emptyFk(): EditableFk {
  return { name: "", columns: "", refTable: "", refColumns: "" };
}

export function emptyColumn(): EditableColumn {
  return {
    name: "new_col",
    dataType: "TEXT",
    nullable: true,
    defaultValue: "",
    isPk: false,
  };
}

export function defaultNewTableColumns(engine: Engine | string): EditableColumn[] {
  if (engine === "postgres") {
    return [
      {
        name: "id",
        dataType: "SERIAL",
        nullable: false,
        defaultValue: "",
        isPk: true,
      },
      {
        name: "name",
        dataType: "TEXT",
        nullable: true,
        defaultValue: "",
        isPk: false,
      },
    ];
  }
  if (engine === "mysql" || engine === "mariadb") {
    return [
      {
        name: "id",
        dataType: "INT AUTO_INCREMENT",
        nullable: false,
        defaultValue: "",
        isPk: true,
      },
      {
        name: "name",
        dataType: "VARCHAR(255)",
        nullable: true,
        defaultValue: "",
        isPk: false,
      },
    ];
  }
  return [
    {
      name: "id",
      dataType: "INTEGER",
      nullable: false,
      defaultValue: "",
      isPk: true,
    },
    {
      name: "name",
      dataType: "TEXT",
      nullable: true,
      defaultValue: "",
      isPk: false,
    },
  ];
}

/** MySQL / MariaDB table options (D12). */
export type TableAdvanced = { engine: string; charset: string; partition: string };

export const EMPTY_ADVANCED: TableAdvanced = { engine: "", charset: "", partition: "" };

/**
 * Fold ENGINE= / CHARSET= into the DDL: create mode extends the CREATE TABLE tail,
 * alter mode appends an ALTER TABLE. PARTITION BY is only a commented hint
 * (partition rules depend on keys and are easiest to run by hand).
 */
export function applyAdvancedOptions(
  engine: string,
  mode: "create" | "alter",
  table: string,
  ddl: string,
  adv: TableAdvanced | undefined,
): string {
  if (!adv || (engine !== "mysql" && engine !== "mariadb")) return ddl;
  const opts = [
    adv.engine.trim() && `ENGINE=${adv.engine.trim()}`,
    adv.charset.trim() && `DEFAULT CHARSET=${adv.charset.trim()}`,
  ].filter(Boolean) as string[];
  let out = ddl;
  if (opts.length) {
    if (mode === "create" && out.includes("\n);")) {
      out = out.replace("\n);", () => `\n) ${opts.join(" ")};`);
    } else {
      out += `${out ? "\n" : ""}ALTER TABLE ${quote(engine, table)} ${opts.join(", ")};`;
    }
  }
  const part = adv.partition.trim().replace(/;\s*$/, "");
  if (part) {
    out += `${out ? "\n" : ""}-- Partition hint (run manually): ALTER TABLE ${quote(engine, table)} ${part};`;
  }
  return out;
}
