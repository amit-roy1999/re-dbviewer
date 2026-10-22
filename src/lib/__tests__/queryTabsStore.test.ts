import { beforeEach, describe, expect, it } from "vitest";
import {
  loadStoredSqlTabs,
  saveStoredSqlTabs,
} from "@/lib/queryTabsStore";

describe("queryTabsStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips tabs per connection", () => {
    saveStoredSqlTabs({
      connectionId: "c1",
      activeId: "t1",
      tabs: [{ id: "t1", sql: "SELECT 1" }],
    });
    expect(loadStoredSqlTabs("c1")).toEqual({
      connectionId: "c1",
      activeId: "t1",
      tabs: [{ id: "t1", sql: "SELECT 1" }],
    });
    expect(loadStoredSqlTabs("other")).toBeNull();
  });
});
