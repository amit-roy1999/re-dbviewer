import { describe, expect, it } from "vitest";
import { buildSyncPlan } from "@/lib/schemaDataSync";

describe("buildSyncPlan", () => {
  it("classifies missing tables and conflicts", () => {
    const plan = buildSyncPlan(
      {
        users: [{ name: "id", type: "INT" }],
        orders: [
          { name: "id", type: "INT" },
          { name: "total", type: "INT" },
        ],
      },
      {
        users: [{ name: "id", type: "BIGINT" }],
        payments: [{ name: "id", type: "INT" }],
      },
      { users: "public.users", orders: "public.orders" },
      { users: { a: 10, b: 8 } },
    );
    expect(plan.missingOnB).toEqual(["public.orders"]);
    expect(plan.onlyOnB).toEqual(["payments"]);
    expect(plan.columnConflicts.some((d) => d.kind === "type differs")).toBe(
      true,
    );
    expect(plan.rowCountHints).toEqual([
      { table: "users", countA: 10, countB: 8 },
    ]);
  });
});
