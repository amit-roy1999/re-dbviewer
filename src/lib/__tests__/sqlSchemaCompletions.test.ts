import { describe, expect, it } from "vitest";
import {
  buildSqlSchemaMap,
  columnsFromDetails,
  extractCteColumns,
  extractTableAliases,
  mergeSqlContextCompletions,
} from "@/lib/sqlSchemaCompletions";
import { sampleSchema } from "./fixtures";

describe("sqlSchemaCompletions", () => {
  it("builds schema map with columns and routines", () => {
    const map = buildSqlSchemaMap(
      sampleSchema,
      { "public.users": ["id", "name"], users: ["id", "name"] },
      [{ schema: "public", name: "fn_count", kind: "function" }],
    );
    expect(map.users).toEqual(["id", "name"]);
    expect(map["public.users"]).toEqual(["id", "name"]);
    expect(map.fn_count).toMatchObject({
      self: { label: "fn_count", type: "function" },
    });
  });

  it("tags views and extracts column names", () => {
    const map = buildSqlSchemaMap(
      [
        {
          name: "main",
          kind: "schema",
          children: [{ name: "v1", kind: "view", children: [] }],
        },
      ],
      { v1: ["a"] },
    );
    expect(map.v1).toMatchObject({
      self: { detail: "view" },
      children: ["a"],
    });
    expect(
      columnsFromDetails({
        columns: [
          {
            name: "id",
            dataType: "INT",
            nullable: false,
            defaultValue: null,
            isPk: true,
          },
        ],
        foreignKeys: [],
        indexes: [],
      }),
    ).toEqual(["id"]);
  });

  it("extracts table aliases from FROM/JOIN", () => {
    expect(
      extractTableAliases(
        "SELECT u.id FROM users u JOIN orders o ON o.user_id = u.id",
      ),
    ).toEqual([
      { table: "users", alias: "u" },
      { table: "orders", alias: "o" },
    ]);
  });

  it("extracts CTE select-list columns", () => {
    expect(
      extractCteColumns(
        "WITH active AS (SELECT id, name AS nm FROM users) SELECT * FROM active",
      ),
    ).toEqual({ active: ["id", "nm"] });
  });

  it("merges alias and CTE into schema map", () => {
    const base = buildSqlSchemaMap(
      sampleSchema,
      { users: ["id", "name"], orders: ["id", "user_id"] },
    );
    const merged = mergeSqlContextCompletions(
      base,
      "WITH t AS (SELECT id FROM users) SELECT u.name FROM users u, t",
      { users: ["id", "name"] },
    );
    expect(merged.u).toMatchObject({
      self: { detail: "alias → users" },
      children: ["id", "name"],
    });
    expect(merged.t).toMatchObject({
      self: { detail: "cte" },
      children: ["id"],
    });
  });
});
