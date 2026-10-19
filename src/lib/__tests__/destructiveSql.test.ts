import { describe, expect, it } from "vitest";
import { isDestructiveSql } from "@/lib/destructiveSql";

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
