import { describe, expect, it } from "vitest";
import {
  cellValueToEditString,
  diffJsonEdits,
  formatResultJson,
  rowsToJson,
} from "@/lib/jsonResultEdit";
import type { QueryResult } from "@/types";

const sample: QueryResult = {
  columns: ["id", "name", "secret"],
  rows: [
    [1, "Ada", "x"],
    [2, "Alan", "y"],
  ],
  rowsAffected: null,
};

describe("jsonResultEdit", () => {
  it("rowsToJson hides columns and applies overrides", () => {
    const rows = rowsToJson(sample, ["secret"], (row, col) =>
      row === 0 && col === "name" ? "Ada Lovelace" : undefined,
    );
    expect(rows).toEqual([
      { id: 1, name: "Ada Lovelace" },
      { id: 2, name: "Alan" },
    ]);
  });

  it("formatResultJson pretty-prints", () => {
    expect(formatResultJson(sample, ["secret"])).toContain('"Ada"');
    expect(formatResultJson(sample, ["secret"])).not.toContain("secret");
  });

  it("cellValueToEditString matches grid conventions", () => {
    expect(cellValueToEditString(null)).toBe("");
    expect(cellValueToEditString(42)).toBe("42");
    expect(cellValueToEditString({ a: 1 })).toBe('{"a":1}');
  });

  it("diffJsonEdits returns cell changes", () => {
    const text = JSON.stringify(
      [
        { id: 1, name: "Ada2" },
        { id: 2, name: "Alan" },
      ],
      null,
      2,
    );
    const out = diffJsonEdits(text, sample, ["secret"]);
    expect(out).toEqual({
      edits: [{ rowIndex: 0, column: "name", value: "Ada2" }],
    });
  });

  it("diffJsonEdits rejects length mismatch and invalid JSON", () => {
    expect(diffJsonEdits("{}", sample)).toEqual({
      error: "JSON must be an array of row objects",
    });
    expect(diffJsonEdits("[]", sample)).toMatchObject({
      error: expect.stringMatching(/Expected 2/),
    });
    expect(diffJsonEdits("{", sample)).toMatchObject({
      error: expect.any(String),
    });
  });

  it("diffJsonEdits treats null as empty string", () => {
    const text = JSON.stringify([{ id: 1, name: null }, { id: 2, name: "Alan" }]);
    const out = diffJsonEdits(text, sample, ["secret"]);
    expect(out).toEqual({
      edits: [{ rowIndex: 0, column: "name", value: "" }],
    });
  });
});
