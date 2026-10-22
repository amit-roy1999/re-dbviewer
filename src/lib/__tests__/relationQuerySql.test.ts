import { describe, expect, it } from "vitest";
import {
  addNeighbors,
  createRootNode,
  emptyGraph,
  joinOrder,
  setNodeIncluded,
  type RelationGraph,
} from "@/lib/relationGraph";
import { buildRelationSelect } from "@/lib/relationQuerySql";
import { parseInboundFkRows } from "@/lib/relationInbound";
import type { TableDetails } from "@/types";

const usersDetails: TableDetails = {
  columns: [
    { name: "id", dataType: "INT", nullable: false, defaultValue: null, isPk: true },
    { name: "name", dataType: "TEXT", nullable: true, defaultValue: null, isPk: false },
  ],
  foreignKeys: [],
  indexes: [],
};

const ordersDetails: TableDetails = {
  columns: [
    { name: "id", dataType: "INT", nullable: false, defaultValue: null, isPk: true },
    { name: "user_id", dataType: "INT", nullable: false, defaultValue: null, isPk: false },
    { name: "total", dataType: "INT", nullable: true, defaultValue: null, isPk: false },
  ],
  foreignKeys: [
    {
      name: "fk_orders_user",
      columns: ["user_id"],
      refTable: "users",
      refColumns: ["id"],
    },
  ],
  indexes: [],
};

const paymentsDetails: TableDetails = {
  columns: [
    { name: "id", dataType: "INT", nullable: false, defaultValue: null, isPk: true },
    { name: "order_id", dataType: "INT", nullable: false, defaultValue: null, isPk: false },
    { name: "amount", dataType: "INT", nullable: true, defaultValue: null, isPk: false },
  ],
  foreignKeys: [
    {
      name: "fk_pay_order",
      columns: ["order_id"],
      refTable: "orders",
      refColumns: ["id"],
    },
  ],
  indexes: [],
};

function seedOrdersRoot(): RelationGraph {
  const root = createRootNode("orders", ordersDetails);
  let g = emptyGraph(root);
  g = addNeighbors(
    g,
    root.id,
    ordersDetails.foreignKeys,
    [
      {
        name: "fk_pay_order",
        columns: ["order_id"],
        refTable: "orders",
        refColumns: ["id"],
        fromTable: "payments",
      },
    ],
    { users: usersDetails, payments: paymentsDetails },
  );
  return g;
}

describe("relationGraph", () => {
  it("seeds outbound and inbound neighbors", () => {
    const g = seedOrdersRoot();
    expect(g.nodes.map((n) => n.name).sort()).toEqual([
      "orders",
      "payments",
      "users",
    ]);
    expect(g.edges).toHaveLength(2);
  });

  it("joinOrder includes path ancestors", () => {
    let g = seedOrdersRoot();
    const pay = g.nodes.find((n) => n.name === "payments")!;
    g = setNodeIncluded(g, pay.id, true);
    // expand payments → already has edge; include is enough
    expect(joinOrder(g)).toEqual(
      expect.arrayContaining([g.rootId, pay.id]),
    );
  });
});

describe("buildRelationSelect", () => {
  it("builds LEFT JOIN with selected columns", () => {
    let g = seedOrdersRoot();
    const users = g.nodes.find((n) => n.name === "users")!;
    g = setNodeIncluded(g, users.id, true);
    const sql = buildRelationSelect({
      graph: g,
      engine: "mysql",
      joinType: "LEFT",
      selected: {
        [g.rootId]: ["id", "total"],
        [users.id]: ["name"],
      },
    });
    expect(sql).toMatch(/SELECT/);
    expect(sql).toMatch(/FROM `orders` t0/);
    expect(sql).toMatch(/LEFT JOIN `users` t1/);
    expect(sql).toMatch(/t0\.`user_id` = t1\.`id`/);
    expect(sql).toMatch(/t0\.`id` AS `orders\.id`/);
    expect(sql).toMatch(/t0\.`total` AS `orders\.total`/);
    expect(sql).toMatch(/t1\.`name` AS `users\.name`/);
  });

  it("defaults to root.* when nothing selected", () => {
    const g = seedOrdersRoot();
    const sql = buildRelationSelect({
      graph: g,
      engine: "postgres",
      joinType: "INNER",
      selected: {},
    });
    expect(sql).toMatch(/SELECT\n {2}t0\.\*/);
    expect(sql).not.toMatch(/JOIN/);
  });

  it("nested inbound hop payments", () => {
    let g = seedOrdersRoot();
    const pay = g.nodes.find((n) => n.name === "payments")!;
    g = setNodeIncluded(g, pay.id, true);
    const sql = buildRelationSelect({
      graph: g,
      engine: "sqlite",
      joinType: "LEFT",
      selected: {
        [g.rootId]: ["id"],
        [pay.id]: ["amount"],
      },
    });
    expect(sql).toMatch(/JOIN "payments"/);
    expect(sql).toMatch(/t0\."id" AS "orders\.id"/);
    expect(sql).toMatch(/t\d+\."amount" AS "payments\.amount"/);
    expect(sql).toMatch(/order_id/);
  });

  it("appends WHERE with AND/OR and skips incomplete / excluded filters", () => {
    let g = seedOrdersRoot();
    const users = g.nodes.find((n) => n.name === "users")!;
    const pay = g.nodes.find((n) => n.name === "payments")!;
    g = setNodeIncluded(g, users.id, true);
    const sql = buildRelationSelect({
      graph: g,
      engine: "mysql",
      joinType: "LEFT",
      selected: { [g.rootId]: ["id"] },
      filters: [
        {
          id: "1",
          nodeId: g.rootId,
          column: "total",
          op: "gt",
          value: "100",
        },
        {
          id: "2",
          nodeId: users.id,
          column: "name",
          op: "like",
          value: "A%",
          join: "and",
        },
        {
          id: "3",
          nodeId: g.rootId,
          column: "id",
          op: "is_null",
          join: "or",
        },
        {
          id: "4",
          nodeId: g.rootId,
          column: "",
          op: "eq",
          value: "1",
        },
        {
          id: "5",
          nodeId: pay.id,
          column: "amount",
          op: "eq",
          value: "9",
        },
      ],
    });
    expect(sql).toMatch(/WHERE t0\.`total` > '100'/);
    expect(sql).toMatch(/AND t1\.`name` LIKE 'A%'/);
    expect(sql).toMatch(/OR t0\.`id` IS NULL/);
    expect(sql).not.toMatch(/amount/);
  });
});

describe("parseInboundFkRows", () => {
  it("groups multi-column FKs", () => {
    const rows = parseInboundFkRows(
      {
        columns: ["n", "s", "t", "c", "r"],
        rows: [
          ["fk1", "public", "orders", "user_id", "id"],
          ["fk1", "public", "orders", "org_id", "org_id"],
        ],
        rowsAffected: null,
      },
      "public.users",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].fromTable).toBe("public.orders");
    expect(rows[0].columns).toEqual(["user_id", "org_id"]);
    expect(rows[0].refColumns).toEqual(["id", "org_id"]);
  });
});
