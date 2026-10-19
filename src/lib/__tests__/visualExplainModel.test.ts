import { describe, expect, it } from "vitest";
import { buildVisualExplain } from "@/lib/visualExplainModel";

describe("visualExplainModel", () => {
  it("builds mysql tabular plan as n-ary join", () => {
    const roots = buildVisualExplain({
      columns: ["id", "select_type", "table", "type", "key", "rows", "Extra"],
      rows: [
        [1, "SIMPLE", "c", "ALL", null, 3, ""],
        [1, "SIMPLE", "u", "ref", "fk", 1, ""],
      ],
      rowsAffected: null,
    });
    expect(roots.length).toBe(1);
    expect(roots[0].kind).toBe("join");
    expect(roots[0].children.length).toBe(2);
  });

  it("builds postgres JSON plan", () => {
    const plan = [
      {
        Plan: {
          "Node Type": "Seq Scan",
          "Relation Name": "users",
          "Total Cost": 10,
          "Plan Rows": 5,
        },
      },
    ];
    const roots = buildVisualExplain({
      columns: ["QUERY PLAN"],
      rows: [[JSON.stringify(plan)]],
      rowsAffected: null,
    });
    expect(roots[0]?.title).toMatch(/Full Table Scan|Seq/i);
  });
});
