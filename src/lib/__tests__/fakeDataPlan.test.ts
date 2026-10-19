import { describe, expect, it } from "vitest";
import {
  applyFkHints,
  defaultColumnsFromDetails,
  kindLabel,
  missingFkParents,
  relatedTableRefs,
} from "@/lib/fakeDataPlan";
import type { TableDetails } from "@/types";

describe("fakeDataPlan", () => {
  it("defaults integer PK to sequence and FK columns to fk", () => {
    const d: TableDetails = {
      columns: [
        {
          name: "id",
          dataType: "INTEGER",
          nullable: false,
          defaultValue: null,
          isPk: true,
        },
        {
          name: "user_id",
          dataType: "INTEGER",
          nullable: false,
          defaultValue: null,
          isPk: false,
        },
        {
          name: "email",
          dataType: "TEXT",
          nullable: true,
          defaultValue: null,
          isPk: false,
        },
      ],
      foreignKeys: [
        {
          name: "fk",
          columns: ["user_id"],
          refTable: "users",
          refColumns: ["id"],
        },
      ],
      indexes: [],
    };
    const cols = defaultColumnsFromDetails(d);
    expect(cols[0].kind).toBe("sequence");
    expect(cols[1].kind).toBe("fk");
    expect(cols[1].refTable).toBe("users");
    expect(cols[2].kind).toBe("auto");
  });

  it("kindLabel is human-readable", () => {
    expect(kindLabel("fullName")).toBe("Full name");
    expect(kindLabel("fk")).toBe("Foreign key");
  });

  it("qualifies FK refs with table schema and finds missing parents", () => {
    const d: TableDetails = {
      columns: [
        {
          name: "user_id",
          dataType: "INT",
          nullable: false,
          defaultValue: null,
          isPk: false,
        },
      ],
      foreignKeys: [
        {
          name: "fk",
          columns: ["user_id"],
          refTable: "users",
          refColumns: ["id"],
        },
      ],
      indexes: [],
    };
    const cols = defaultColumnsFromDetails(d, "eloquent_demo.orders");
    expect(cols[0].refTable).toBe("eloquent_demo.users");
    expect(
      missingFkParents(["eloquent_demo.orders"], {
        "eloquent_demo.orders": {
          table: "eloquent_demo.orders",
          rowCount: 10,
          columns: cols,
        },
      }),
    ).toEqual(["eloquent_demo.users"]);
  });

  it("marks single-column unique indexes", () => {
    const d: TableDetails = {
      columns: [
        {
          name: "supplier_id",
          dataType: "INT",
          nullable: false,
          defaultValue: null,
          isPk: false,
        },
      ],
      foreignKeys: [
        {
          name: "fk",
          columns: ["supplier_id"],
          refTable: "suppliers",
          refColumns: ["id"],
        },
      ],
      indexes: [
        { name: "accounts_supplier_id_unique", unique: true, columns: ["supplier_id"] },
      ],
    };
    const cols = defaultColumnsFromDetails(d, "accounts");
    expect(cols[0].kind).toBe("fk");
    expect(cols[0].unique).toBe(true);
  });

  it("relatedTableRefs qualifies outbound and inbound", () => {
    const d: TableDetails = {
      columns: [],
      foreignKeys: [
        {
          name: "fk",
          columns: ["user_id"],
          refTable: "users",
          refColumns: ["id"],
        },
      ],
      indexes: [],
    };
    const refs = relatedTableRefs("demo.orders", d, [
      { fromTable: "demo.order_items" },
    ]);
    expect(refs).toEqual(
      expect.arrayContaining(["demo.users", "demo.order_items"]),
    );
    expect(refs).not.toContain("demo.orders");
    expect(refs).not.toContain("orders");
  });

  it("applyFkHints overrides kind and refs", () => {
    const cols = applyFkHints(
      [{ name: "user_id", kind: "auto" }],
      [
        {
          name: "fk",
          columns: ["user_id"],
          refTable: "users",
          refColumns: ["id"],
        },
      ],
    );
    expect(cols[0].kind).toBe("fk");
    expect(cols[0].refTable).toBe("users");
    expect(cols[0].refColumn).toBe("id");
  });

  it("missingFkParents treats short-name parent as present", () => {
    expect(
      missingFkParents(["orders", "users"], {
        orders: {
          table: "orders",
          rowCount: 10,
          columns: [
            {
              name: "user_id",
              kind: "fk",
              refTable: "demo.users",
              refColumn: "id",
            },
          ],
        },
      }),
    ).toEqual([]);
  });

  it("defaultColumnsFromDetails sets json auto fixed value", () => {
    const d: TableDetails = {
      columns: [
        {
          name: "meta",
          dataType: "JSON",
          nullable: true,
          defaultValue: null,
          isPk: false,
        },
      ],
      foreignKeys: [],
      indexes: [],
    };
    const cols = defaultColumnsFromDetails(d);
    expect(cols[0].kind).toBe("auto");
    expect(cols[0].value).toBe("{}");
  });
});
