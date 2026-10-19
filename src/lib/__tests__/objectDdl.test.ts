import { describe, expect, it } from "vitest";
import {
  buildViewSql,
  extractViewBody,
  isMysqlLike,
  routineTemplate,
  routinesFromResult,
} from "@/lib/objectDdl";

describe("objectDdl", () => {
  it("isMysqlLike", () => {
    expect(isMysqlLike("mysql")).toBe(true);
    expect(isMysqlLike("postgres")).toBe(false);
  });

  it("buildViewSql create/replace", () => {
    expect(buildViewSql("mysql", "v", "SELECT 1", "create")).toMatch(
      /CREATE VIEW/,
    );
    expect(buildViewSql("postgres", "v", "SELECT 1", "alter")).toMatch(
      /CREATE OR REPLACE VIEW/,
    );
  });

  it("extractViewBody and routines", () => {
    expect(extractViewBody("CREATE VIEW v AS SELECT 1;")).toMatch(/SELECT 1/);
    expect(routineTemplate("procedure")).toContain("BEGIN");
    expect(
      routinesFromResult({
        columns: ["s", "n", "t"],
        rows: [["db", "p1", "PROCEDURE"]],
        rowsAffected: null,
      })[0],
    ).toEqual({ schema: "db", name: "p1", kind: "procedure" });
  });
});
