import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, getStoredTheme, toggleTheme } from "@/lib/theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to light and toggles", () => {
    expect(getStoredTheme()).toBe("light");
    expect(toggleTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(getStoredTheme()).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
