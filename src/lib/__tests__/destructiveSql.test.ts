import { describe, expect, it } from "vitest";
import { isDestructiveSql, isSafeModeConfirmSql } from "@/lib/destructiveSql";

describe("isDestructiveSql", () => {
  it("flags drop delete truncate", () => {
    expect(isDestructiveSql("DROP TABLE t")).toBe(true);
    expect(isDestructiveSql("DELETE FROM t")).toBe(true);
    expect(isDestructiveSql("TRUNCATE t")).toBe(true);
  });

  it("ignores comments and allows select", () => {
    expect(isDestructiveSql("-- DROP\nSELECT 1")).toBe(false);
    expect(isDestructiveSql("/* DELETE */ SELECT 1")).toBe(false);
    expect(isDestructiveSql("UPDATE t SET a=1")).toBe(false);
  });
});

describe("isSafeModeConfirmSql", () => {
  it("includes writes and destructive", () => {
    expect(isSafeModeConfirmSql("UPDATE t SET a=1")).toBe(true);
    expect(isSafeModeConfirmSql("INSERT INTO t VALUES (1)")).toBe(true);
    expect(isSafeModeConfirmSql("DELETE FROM t")).toBe(true);
    expect(isSafeModeConfirmSql("SELECT 1")).toBe(false);
  });
});
