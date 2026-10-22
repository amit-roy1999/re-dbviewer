import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, getStoredTheme, toggleTheme } from "@/lib/theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to dark and toggles", () => {
    expect(getStoredTheme()).toBe("dark");
    expect(toggleTheme()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(getStoredTheme()).toBe("light");
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
