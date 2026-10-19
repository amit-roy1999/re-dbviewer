import { describe, expect, it } from "vitest";
import { jsonToInserts } from "@/lib/importJson";

describe("jsonToInserts", () => {
  it("builds insert statements", () => {
    const { statements, rows, ignoredKeys } = jsonToInserts(
      "users",
      JSON.stringify([{ id: 1, name: "Ada", extra: true }]),
      "postgres",
      ["id", "name"],
    );
    expect(rows).toBe(1);
    expect(ignoredKeys).toContain("extra");
    expect(statements[0]).toMatch(/INSERT INTO "users"/);
    expect(statements[0]).toContain("'Ada'");
  });

  it("rejects non-array", () => {
    expect(() =>
      jsonToInserts("t", "{}", "mysql", ["id"]),
    ).toThrow(/array/);
  });
});
