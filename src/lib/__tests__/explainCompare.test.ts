import { describe, expect, it } from "vitest";
import { comparePlans, summarizePlan } from "@/lib/explainCompare";

describe("explainCompare", () => {
  const a = {
    columns: ["id", "select_type", "table", "type", "rows"],
    rows: [[1, "SIMPLE", "t", "ALL", 10]],
    rowsAffected: null,
  };
  const b = {
    columns: ["id", "select_type", "table", "type", "rows"],
    rows: [
      [1, "SIMPLE", "t", "ref", 1],
      [1, "SIMPLE", "u", "ref", 1],
    ],
    rowsAffected: null,
  };

  it("summarizes and compares", () => {
    const s = summarizePlan(a);
    expect(s.steps).toBeGreaterThanOrEqual(1);
    const diff = comparePlans(a, b);
    expect(diff).toBeTruthy();
  });
});
