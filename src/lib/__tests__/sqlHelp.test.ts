import { describe, expect, it } from "vitest";
import { helpForWord, searchHelp, SQL_HELP } from "@/lib/sqlHelp";

describe("sqlHelp", () => {
  it("looks up by keyword", () => {
    expect(helpForWord("select")?.keyword).toBe("SELECT");
    expect(helpForWord("")).toBeNull();
  });

  it("searches text", () => {
    expect(searchHelp("").length).toBe(SQL_HELP.length);
    expect(searchHelp("join").some((h) => h.keyword === "JOIN")).toBe(true);
  });
});
