import { describe, expect, it } from "vitest";
import { suggestSql } from "@/lib/aiSqlAssist";

describe("suggestSql", () => {
  it("lists tables for sqlite", () => {
    expect(suggestSql("list tables", "sqlite")).toMatch(/sqlite_master/);
  });

  it("counts a named table", () => {
    expect(suggestSql("count from users", "postgres")).toMatch(
      /COUNT\(\*\).*users/i,
    );
  });
});
