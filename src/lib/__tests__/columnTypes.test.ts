import { describe, expect, it } from "vitest";
import { columnTypeOptions, typeSelectOptions } from "@/lib/columnTypes";

describe("columnTypes", () => {
  it("returns engine-specific lists", () => {
    expect(columnTypeOptions("mysql")).toContain("INT AUTO_INCREMENT");
    expect(columnTypeOptions("mariadb")).toContain("JSON");
    expect(columnTypeOptions("postgres")).toContain("JSONB");
    expect(columnTypeOptions("mssql")).toContain("NVARCHAR(MAX)");
    expect(columnTypeOptions("sqlite")).toEqual(
      expect.arrayContaining(["INTEGER", "TEXT", "BLOB"]),
    );
    expect(columnTypeOptions("unknown")).toEqual(columnTypeOptions("sqlite"));
  });

  it("typeSelectOptions keeps current when not in list", () => {
    const base = columnTypeOptions("sqlite");
    expect(typeSelectOptions("sqlite", "")).toEqual(base);
    expect(typeSelectOptions("sqlite", "INTEGER")).toEqual(base);
    expect(typeSelectOptions("sqlite", "integer")).toEqual(base);
    expect(typeSelectOptions("sqlite", "FOO(9)")[0]).toBe("FOO(9)");
    expect(typeSelectOptions("sqlite", "FOO(9)").slice(1)).toEqual(base);
  });
});
