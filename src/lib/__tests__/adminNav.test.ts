import { describe, expect, it } from "vitest";
import { ADMIN_NAV, DEFAULT_ADMIN_VIEW } from "@/lib/adminNav";

describe("adminNav", () => {
  it("defaults to serverStatus", () => {
    expect(DEFAULT_ADMIN_VIEW).toBe("serverStatus");
  });

  it("has Management, Instance, Performance groups", () => {
    expect(ADMIN_NAV.map((g) => g.id)).toEqual([
      "management",
      "instance",
      "performance",
    ]);
  });

  it("lists unique view ids", () => {
    const ids = ADMIN_NAV.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("serverStatus");
    expect(ids).toContain("queryMonitor");
    expect(ids).toContain("optionsFile");
    expect(ids).toContain("perfSchemaSetup");
  });
});
