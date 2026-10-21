import { describe, expect, it } from "vitest";
import {
  addNeighbors,
  createRootNode,
  emptyGraph,
  joinOrder,
  setNodeIncluded,
} from "@/lib/relationGraph";
import type { TableDetails } from "@/types";

const users: TableDetails = {
  columns: [
    {
      name: "id",
      dataType: "INT",
      nullable: false,
      defaultValue: null,
      isPk: true,
    },
  ],
  indexes: [],
  foreignKeys: [
    {
      name: "fk_org",
      columns: ["org_id"],
      refTable: "orgs",
      refColumns: ["id"],
    },
  ],
};

const orgs: TableDetails = {
  columns: [
    {
      name: "id",
      dataType: "INT",
      nullable: false,
      defaultValue: null,
      isPk: true,
    },
  ],
  indexes: [],
  foreignKeys: [],
};

describe("relationGraph", () => {
  it("createRootNode and emptyGraph", () => {
    const root = createRootNode("public.users", users);
    expect(root.isRoot).toBe(true);
    expect(root.included).toBe(true);
    expect(root.name).toBe("users");
    expect(emptyGraph(root).nodes).toHaveLength(1);
  });

  it("addNeighbors and joinOrder for included leaf", () => {
    const root = createRootNode("public.users", users);
    let g = emptyGraph(root);
    g = addNeighbors(
      g,
      root.id,
      users.foreignKeys,
      [
        {
          name: "fk_orders",
          columns: ["user_id"],
          refTable: "public.users",
          refColumns: ["id"],
          fromTable: "public.orders",
        },
      ],
      { "public.orgs": orgs, orgs },
    );
    expect(g.nodes.length).toBeGreaterThanOrEqual(2);
    expect(g.edges.some((e) => e.direction === "out")).toBe(true);
    expect(g.edges.some((e) => e.direction === "in")).toBe(true);

    const org = g.nodes.find((n) => n.name === "orgs")!;
    g = setNodeIncluded(g, org.id, true);
    const order = joinOrder(g);
    expect(order[0]).toBe(root.id);
    expect(order).toContain(org.id);
  });
});
