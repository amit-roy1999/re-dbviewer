import { describe, expect, it } from "vitest";
import { compareRows, rowKey } from "@/lib/dataCompare";

describe("dataCompare", () => {
  it("rowKey joins key cells", () => {
    expect(rowKey([1, "a", null], [0, 2])).toBe("1\u0001∅");
  });

  it("reports onlyA, onlyB, and column diffs", () => {
    const a = {
      columns: ["id", "name", "age"],
      rows: [
        [1, "alice", 30],
        [2, "bob", 40],
        [3, "carol", 50],
      ],
    };
    const b = {
      columns: ["id", "name", "age"],
      rows: [
        [1, "alice", 31],
        [2, "bob", 40],
        [4, "dave", 20],
      ],
    };
    const diffs = compareRows(a, b, ["id"]);
    expect(diffs.filter((d) => d.kind === "onlyA")).toEqual([
      { kind: "onlyA", key: "3", row: [3, "carol", 50] },
    ]);
    expect(diffs.filter((d) => d.kind === "onlyB")).toEqual([
      { kind: "onlyB", key: "4", row: [4, "dave", 20] },
    ]);
    expect(diffs.filter((d) => d.kind === "diff")).toEqual([
      {
        kind: "diff",
        key: "1",
        rowA: [1, "alice", 30],
        rowB: [1, "alice", 31],
        columns: ["age"],
      },
    ]);
  });

  it("throws when key column missing", () => {
    expect(() =>
      compareRows(
        { columns: ["id"], rows: [[1]] },
        { columns: ["x"], rows: [[1]] },
        ["id"],
      ),
    ).toThrow(/Key column/);
  });
});
