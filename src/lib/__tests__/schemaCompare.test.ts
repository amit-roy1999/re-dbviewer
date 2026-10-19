import { describe, expect, it } from "vitest";
import { compareSnapshots, snapshotFromSql } from "@/lib/schemaCompare";

describe("schemaCompare", () => {
  it("diffs snapshots", () => {
    const a = {
      users: [{ name: "id", type: "INT" }],
    };
    const b = {
      users: [
        { name: "id", type: "BIGINT" },
        { name: "email", type: "TEXT" },
      ],
      orders: [{ name: "id", type: "INT" }],
    };
    const diffs = compareSnapshots(a, b);
    expect(diffs.some((d) => d.kind === "type differs")).toBe(true);
    expect(diffs.some((d) => d.kind === "column only in B")).toBe(true);
    expect(diffs.some((d) => d.kind === "table only in B")).toBe(true);
  });

  it("parses create table sql snapshot", () => {
    const snap = snapshotFromSql(
      "CREATE TABLE users (id INT, name VARCHAR(40));",
    );
    expect(Object.keys(snap).length).toBeGreaterThanOrEqual(1);
  });
});
