import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatTableStatsLine,
  parseTableStats,
  tableStatsSql,
} from "@/lib/tableStats";

describe("tableStats", () => {
  it("builds catalog SQL per engine", () => {
    expect(tableStatsSql("mysql", "db.users")).toMatch(/information_schema\.TABLES/);
    expect(tableStatsSql("mysql", "db.users")).toContain("TABLE_SCHEMA = 'db'");
    expect(tableStatsSql("postgres", "public.t")).toMatch(/pg_stat_user_tables/);
    expect(tableStatsSql("sqlite", "users")).toMatch(/COUNT\(\*\)/);
    expect(tableStatsSql("mssql", "dbo.t")).toMatch(/sys\.partitions/);
    expect(tableStatsSql("oracle", "t")).toBeNull();
  });

  it("escapes quotes in identifiers", () => {
    expect(tableStatsSql("mysql", "a'b")).toContain("'a''b'");
  });

  it("parseTableStats handles empty and engine shapes", () => {
    expect(parseTableStats("sqlite", { columns: [], rows: [], rowsAffected: null })).toEqual({
      rows: null,
      rowsApprox: false,
      sizeBytes: null,
    });
    expect(
      parseTableStats("sqlite", {
        columns: ["n"],
        rows: [[42]],
        rowsAffected: null,
      }),
    ).toEqual({ rows: 42, rowsApprox: false, sizeBytes: null });
    expect(
      parseTableStats("mssql", {
        columns: ["n"],
        rows: [[100]],
        rowsAffected: null,
      }).rowsApprox,
    ).toBe(true);
    expect(
      parseTableStats("mysql", {
        columns: ["r", "s"],
        rows: [[10, 2048]],
        rowsAffected: null,
      }),
    ).toEqual({ rows: 10, rowsApprox: true, sizeBytes: 2048 });
  });

  it("formatBytes and formatTableStatsLine", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toMatch(/KB/);
    expect(formatBytes(2 * 1024 * 1024)).toMatch(/MB/);
    expect(
      formatTableStatsLine({
        table: "users",
        columns: 3,
        indexes: 1,
        fks: 0,
        stats: { rows: 1000, rowsApprox: true, sizeBytes: 1024 },
      }),
    ).toMatch(/users · 3 columns · 1 indexes · 0 FKs · ~1,000 rows/);
    expect(formatTableStatsLine({ table: "t", loading: true })).toContain("…");
  });
});
