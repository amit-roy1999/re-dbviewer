import { describe, expect, it } from "vitest";
import { formatSql } from "@/lib/formatSql";

describe("formatSql", () => {
  it("preserves keyword casing and keeps identifiers", () => {
    const out = formatSql("select id from users where id=1");
    expect(out).toContain("select");
    expect(out).toContain("users");
    expect(out).not.toContain("SELECT");
  });

  it("returns empty for blank", () => {
    expect(formatSql("   ").trim()).toBe("");
  });
});
