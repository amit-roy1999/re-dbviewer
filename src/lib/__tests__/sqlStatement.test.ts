import { describe, expect, it } from "vitest";
import { splitStatements, sqlToExecute } from "@/lib/sqlStatement";

describe("sqlStatement", () => {
  it("splits on semicolons outside quotes", () => {
    expect(splitStatements("SELECT 1; SELECT 2")).toEqual([
      "SELECT 1",
      "SELECT 2",
    ]);
    expect(splitStatements("SELECT ';';")).toEqual(["SELECT ';'"]);
  });

  it("sqlToExecute prefers selection", () => {
    expect(sqlToExecute("SELECT 1; SELECT 2", "SELECT 2", 0)).toBe("SELECT 2");
    expect(sqlToExecute("SELECT 1", "", 0)).toBe("SELECT 1");
  });
});
