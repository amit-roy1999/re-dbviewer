import { describe, expect, it } from "vitest";
import { renameWithDependentsSql } from "@/lib/renameDependents";

describe("renameWithDependentsSql", () => {
  it("emits rename and notes dependents", () => {
    const sql = renameWithDependentsSql("postgres", "public.users", "people", {
      "public.orders": {
        columns: [],
        indexes: [],
        foreignKeys: [
          {
            name: "fk_o",
            columns: ["user_id"],
            refTable: "public.users",
            refColumns: ["id"],
          },
        ],
      },
    });
    expect(sql).toMatch(/RENAME TO/);
    expect(sql).toMatch(/Dependent FK/);
  });
});
