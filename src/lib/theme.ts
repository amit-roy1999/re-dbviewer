const KEY = "re-dbviewer-theme";

export type Theme = "light" | "dark";

export function getStoredTheme(): Theme {
  const v = localStorage.getItem(KEY);
  if (v === "light") return "light";
  // First launch (and any non-light value): dark so the query editor opens black.
  return "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem(KEY, theme);
}

export function toggleTheme(): Theme {
  const next: Theme = getStoredTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
