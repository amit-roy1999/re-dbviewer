import { describe, expect, it } from "vitest";
import { createTableForTarget, defaultTypeMap, mapType } from "@/lib/typeMap";

describe("typeMap", () => {
  it("maps base types with length preserved", () => {
    expect(mapType("BOOLEAN", defaultTypeMap("mysql"))).toBe("TINYINT(1)");
    expect(mapType("VARCHAR(40)", defaultTypeMap("postgres"))).toBe(
      "VARCHAR(40)",
    );
    expect(mapType("INT", defaultTypeMap("postgres"))).toBe("INTEGER");
  });

  it("builds CREATE TABLE for target", () => {
    const sql = createTableForTarget(
      "postgres",
      "users",
      {
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
      },
      defaultTypeMap("postgres"),
    );
    expect(sql).toMatch(/CREATE TABLE "users"/);
    expect(sql).toMatch(/INTEGER/);
    expect(sql).toMatch(/PRIMARY KEY/);
  });
});
