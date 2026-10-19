import type { QueryResult, SchemaNode } from "@/types";

export const sampleResult: QueryResult = {
  columns: ["id", "name"],
  rows: [
    [1, "Ada"],
    [2, "Alan"],
  ],
  rowsAffected: null,
};

export const sampleSchema: SchemaNode[] = [
  {
    name: "public",
    kind: "schema",
    children: [
      { name: "users", kind: "table", children: [] },
      { name: "orders", kind: "table", children: [] },
    ],
  },
];
