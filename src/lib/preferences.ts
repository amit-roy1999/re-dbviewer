import { useEffect, useState } from "react";

export type AppPreferences = {
  editorFontSize: number;
  editorTabSize: number;
  editorSoftWrap: boolean;
  defaultLimit: number;
  confirmDestructive: boolean;
  highContrast: boolean;
  /** Whole-app UI zoom percent (50–200). Ctrl+Plus / Ctrl+Minus. */
  uiZoom: number;
};

const KEY = "re-dbviewer:preferences";

export const DEFAULT_PREFS: AppPreferences = {
  editorFontSize: 13,
  editorTabSize: 2,
  editorSoftWrap: false,
  defaultLimit: 100,
  confirmDestructive: true,
  highContrast: false,
  uiZoom: 100,
};

export const UI_ZOOM_MIN = 50;
export const UI_ZOOM_MAX = 200;
export const UI_ZOOM_STEP = 10;

export function clampUiZoom(n: number): number {
  if (!Number.isFinite(n)) return 100;
  return Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, Math.round(n)));
}

export function loadPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<AppPreferences>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export const PREFS_EVENT = "re-dbviewer:preferences-changed";

export function savePreferences(prefs: AppPreferences) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
  applyPreferenceEffects(prefs);
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: prefs }));
}

/** Live preferences: re-renders when the Preferences dialog saves. */
export function usePreferences(): AppPreferences {
  const [prefs, setPrefs] = useState(loadPreferences);
  useEffect(() => {
    const on = (e: Event) =>
      setPrefs((e as CustomEvent<AppPreferences>).detail ?? loadPreferences());
    window.addEventListener(PREFS_EVENT, on);
    return () => window.removeEventListener(PREFS_EVENT, on);
  }, []);
  return prefs;
}

export function applyPreferenceEffects(prefs: AppPreferences) {
  document.documentElement.style.setProperty(
    "--editor-font-size",
    `${prefs.editorFontSize}px`,
  );
  const zoom = clampUiZoom(prefs.uiZoom) / 100;
  document.documentElement.style.setProperty("--ui-zoom", String(zoom));
  // Scale #root with transform (not CSS zoom). Transform creates a containing
  // block so portaled menus stay aligned and collision-detect correctly.
  const root = document.getElementById("root");
  if (root) {
    const zs = root.style as CSSStyleDeclaration & { zoom?: string };
    zs.zoom = "";
    if (zoom === 1) {
      root.style.transform = "";
      root.style.transformOrigin = "";
      root.style.width = "";
      root.style.height = "";
    } else {
      root.style.transformOrigin = "0 0";
      root.style.transform = `scale(${zoom})`;
      root.style.width = `${100 / zoom}%`;
      root.style.height = `${100 / zoom}%`;
    }
  }
  const html = document.documentElement.style as CSSStyleDeclaration & {
    zoom?: string;
  };
  html.zoom = "";
  document.documentElement.classList.toggle("high-contrast", prefs.highContrast);
}

/** Bump app zoom by ±step percent and persist. */
export function bumpUiZoom(delta: number): AppPreferences {
  const cur = loadPreferences();
  const next = {
    ...cur,
    uiZoom: clampUiZoom(cur.uiZoom + delta),
  };
  savePreferences(next);
  return next;
}

export function resetUiZoom(): AppPreferences {
  const next = { ...loadPreferences(), uiZoom: 100 };
  savePreferences(next);
  return next;
}
