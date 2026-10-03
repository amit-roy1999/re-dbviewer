const KEY = "re-dbviewer-theme";

export type Theme = "light" | "dark";

export function getStoredTheme(): Theme {
  const v = localStorage.getItem(KEY);
  return v === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem(KEY, theme);
}

export function toggleTheme(): Theme {
  const next: Theme = getStoredTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
