import { beforeEach, describe, expect, it } from "vitest";
import {
  clampUiZoom,
  DEFAULT_PREFS,
  loadPreferences,
  savePreferences,
  UI_ZOOM_MAX,
  UI_ZOOM_MIN,
} from "@/lib/preferences";

describe("preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    const root = document.getElementById("root") ?? document.createElement("div");
    root.id = "root";
    if (!root.parentElement) document.body.appendChild(root);
    root.style.cssText = "";
  });

  it("clamps zoom", () => {
    expect(clampUiZoom(10)).toBe(UI_ZOOM_MIN);
    expect(clampUiZoom(999)).toBe(UI_ZOOM_MAX);
    expect(clampUiZoom(NaN)).toBe(100);
  });

  it("load/save round trip", () => {
    expect(loadPreferences().uiZoom).toBe(DEFAULT_PREFS.uiZoom);
    savePreferences({ ...DEFAULT_PREFS, uiZoom: 120, editorFontSize: 15 });
    expect(loadPreferences().uiZoom).toBe(120);
    expect(loadPreferences().editorFontSize).toBe(15);
  });
});
