import { describe, expect, it } from "vitest";
import {
  buildSqlSchemaMap,
  columnsFromDetails,
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
});
