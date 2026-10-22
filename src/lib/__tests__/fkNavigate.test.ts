import { describe, expect, it } from "vitest";
import type { ForeignKeyInfo } from "@/types";
import {
  buildFkPeekSql,
  fkForColumn,
  fkTargetFromRow,
} from "@/lib/fkNavigate";

const fk: ForeignKeyInfo = {
  name: "fk_orders_user",
  columns: ["user_id"],
  refTable: "users",
  refColumns: ["id"],
};

const composite: ForeignKeyInfo = {
  name: "fk_comp",
  columns: ["a", "b"],
  refTable: "parent",
  refColumns: ["pa", "pb"],
};

const cols = [
  { name: "id", index: 0 },
  { name: "user_id", index: 1 },
  { name: "a", index: 2 },
  { name: "b", index: 3 },
];

describe("fkForColumn", () => {
  it("finds FK by local column", () => {
    expect(fkForColumn([fk, composite], "user_id")).toEqual(fk);
    expect(fkForColumn([fk, composite], "a")).toEqual(composite);
    expect(fkForColumn([fk], "missing")).toBeNull();
    expect(fkForColumn([], "user_id")).toBeNull();
  });
});

describe("fkTargetFromRow", () => {
  it("builds filters for a simple FK", () => {
    expect(fkTargetFromRow(fk, cols, [1, 42, null, null])).toEqual({
      table: "users",
      filters: [{ column: "id", op: "eq", value: "42" }],
    });
  });

  it("returns null when FK value is null", () => {
    expect(fkTargetFromRow(fk, cols, [1, null, null, null])).toBeNull();
  });

  it("builds AND filters for composite FKs", () => {
    expect(fkTargetFromRow(composite, cols, [1, 9, "x", "y"])).toEqual({
      table: "parent",
      filters: [
        { column: "pa", op: "eq", value: "x" },
        { column: "pb", op: "eq", value: "y", join: "and" },
      ],
    });
  });

  it("returns null if any composite part is null", () => {
    expect(fkTargetFromRow(composite, cols, [1, 9, "x", null])).toBeNull();
  });
});

describe("buildFkPeekSql", () => {
  it("builds WHERE with LIMIT", () => {
    const sql = buildFkPeekSql("mysql", "users", [
      { column: "id", op: "eq", value: "42" },
    ]);
    expect(sql).toBe("SELECT * FROM `users` WHERE `id` = '42' LIMIT 20");
  });

  it("joins composite predicates", () => {
    const sql = buildFkPeekSql("postgres", "parent", [
      { column: "pa", op: "eq", value: "x" },
      { column: "pb", op: "eq", value: "y", join: "and" },
    ]);
    expect(sql).toBe(
      'SELECT * FROM "parent" WHERE "pa" = \'x\' AND "pb" = \'y\' LIMIT 20',
    );
  });
});
