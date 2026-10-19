import { beforeEach, describe, expect, it } from "vitest";
import { cn, overlayPortalContainer } from "@/lib/utils";

describe("utils", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("cn merges class names", () => {
    expect(cn("a", false && "b", "c")).toContain("a");
    expect(cn("a", "c")).toContain("c");
  });

  it("overlayPortalContainer prefers #root", () => {
    expect(overlayPortalContainer()).toBe(document.body);
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
    expect(overlayPortalContainer()).toBe(root);
  });
});
