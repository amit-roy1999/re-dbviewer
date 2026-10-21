import { describe, expect, it } from "vitest";
import {
  duplicateTableSql,
  qualifySibling,
  selectTopSql,
} from "@/lib/tableMenuSql";

describe("tableMenuSql", () => {
  it("qualifySibling keeps schema except on sqlite", () => {
    expect(qualifySibling("postgres", "public.users", "users_copy")).toBe(
      "public.users_copy",
    );
    expect(qualifySibling("mysql", "db.t", "t2")).toBe("db.t2");
    expect(qualifySibling("sqlite", "users", "users_copy")).toBe("users_copy");
    expect(qualifySibling("postgres", "users", "users_copy")).toBe("users_copy");
  });

  it("selectTopSql uses TOP on mssql and LIMIT elsewhere", () => {
    expect(selectTopSql("mssql", "[dbo].[t]")).toBe(
      "SELECT TOP 100 * FROM [dbo].[t];",
    );
    expect(selectTopSql("postgres", '"public"."t"')).toBe(
      'SELECT * FROM "public"."t"\nLIMIT 100;',
    );
    expect(selectTopSql("sqlite", '"t"')).toContain("LIMIT 100");
  });

  it("duplicateTableSql uses SELECT INTO on mssql else CTAS", () => {
    expect(duplicateTableSql("mssql", "[a]", "[b]")).toBe(
      "SELECT * INTO [b] FROM [a]",
    );
    expect(duplicateTableSql("mysql", "`a`", "`b`")).toBe(
      "CREATE TABLE `b` AS SELECT * FROM `a`",
    );
  });
});
