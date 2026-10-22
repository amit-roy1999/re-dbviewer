import { describe, expect, it } from "vitest";
import { pivotResult } from "@/lib/pivotResult";

describe("pivotResult", () => {
  it("sums values into a crosstab", () => {
    const r = pivotResult(
      {
        columns: ["r", "c", "v"],
        rows: [
          ["a", "x", 1],
          ["a", "y", 2],
          ["b", "x", 3],
        ],
        rowsAffected: null,
      },
      "r",
      "c",
      "v",
      "sum",
    );
    expect(r.columns).toEqual(["r", "x", "y"]);
    expect(r.rows).toContainEqual(["a", 1, 2]);
    expect(r.rows).toContainEqual(["b", 3, 0]);
  });
});
