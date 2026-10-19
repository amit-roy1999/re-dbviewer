import { describe, expect, it } from "vitest";
import { buildExplainSql, isReadSql, stripTrailingSemi } from "@/lib/explainSql";

describe("explainSql", () => {
  it("detects read SQL", () => {
    expect(isReadSql("SELECT 1")).toBe(true);
    expect(isReadSql("WITH x AS (SELECT 1) SELECT * FROM x")).toBe(true);
    expect(isReadSql("DELETE FROM t")).toBe(false);
  });

  it("builds engine explain SQL", () => {
    expect(buildExplainSql("sqlite", "SELECT 1", false)).toMatch(
      /EXPLAIN QUERY PLAN/,
    );
    expect(buildExplainSql("mysql", "SELECT 1", true)).toBe(
      "EXPLAIN ANALYZE SELECT 1",
    );
    expect(buildExplainSql("postgres", "SELECT 1", false)).toMatch(
      /FORMAT JSON/,
    );
    expect(() => buildExplainSql("mssql", "SELECT 1", false)).toThrow();
  });

  it("strips trailing semicolons", () => {
    expect(stripTrailingSemi("SELECT 1;;")).toBe("SELECT 1");
  });
});
