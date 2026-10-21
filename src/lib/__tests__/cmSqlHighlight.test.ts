import { describe, expect, it } from "vitest";
import { isDomDark, sqlHighlightExt } from "@/lib/cmSqlHighlight";

describe("cmSqlHighlight", () => {
  it("isDomDark reads document class", () => {
    document.documentElement.classList.remove("dark");
    expect(isDomDark()).toBe(false);
    document.documentElement.classList.add("dark");
    expect(isDomDark()).toBe(true);
    document.documentElement.classList.remove("dark");
  });

  it("sqlHighlightExt returns an extension", () => {
    expect(sqlHighlightExt(true)).toBeTruthy();
    expect(sqlHighlightExt(false)).toBeTruthy();
  });
});
