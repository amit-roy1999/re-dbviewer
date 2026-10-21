import { describe, expect, it } from "vitest";
import { inboundFksSql, parseInboundFkRows } from "@/lib/relationInbound";

describe("relationInbound", () => {
  it("inboundFksSql per engine", () => {
    expect(inboundFksSql("sqlite", "t")).toBeNull();
    expect(inboundFksSql("mysql", "db.users")).toMatch(/KEY_COLUMN_USAGE/);
    expect(inboundFksSql("mysql", "db.users")).toContain(
      "REFERENCED_TABLE_SCHEMA = 'db'",
    );
    expect(inboundFksSql("postgres", "public.t")).toMatch(/FOREIGN KEY/);
    expect(inboundFksSql("mssql", "dbo.t")).toMatch(/sys\.foreign_keys/);
  });

  it("parseInboundFkRows groups composite FKs", () => {
    const fks = parseInboundFkRows(
      {
        columns: ["n", "s", "t", "c", "r"],
        rows: [
          ["fk1", "public", "orders", "user_id", "id"],
          ["fk1", "public", "orders", "org_id", "org_id"],
          ["fk2", "main", "logs", "uid", "id"],
        ],
        rowsAffected: null,
      },
      "public.users",
    );
    expect(fks).toHaveLength(2);
    const orders = fks.find((f) => f.fromTable === "public.orders")!;
    expect(orders.columns).toEqual(["user_id", "org_id"]);
    expect(orders.refColumns).toEqual(["id", "org_id"]);
    expect(fks.find((f) => f.fromTable === "logs")!.name).toBe("fk2");
  });
});
