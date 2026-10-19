export type Snippet = {
  id: string;
  title: string;
  body: string;
  builtin?: boolean;
};

const BUILTINS: Snippet[] = [
  {
    id: "builtin-select-star",
    title: "SELECT *",
    body: "SELECT *\nFROM ${table}\nLIMIT 100;",
    builtin: true,
  },
  {
    id: "builtin-count",
    title: "COUNT rows",
    body: "SELECT COUNT(*) AS n\nFROM ${table};",
    builtin: true,
  },
  {
    id: "builtin-explain",
    title: "EXPLAIN",
    body: "EXPLAIN\nSELECT *\nFROM ${table}\nLIMIT 10;",
    builtin: true,
  },
];

function storageKey(connectionId: string) {
  return `re-dbviewer:snippets:${connectionId}`;
}

export function listSnippets(connectionId: string): Snippet[] {
  let user: Snippet[] = [];
  try {
    const raw = localStorage.getItem(storageKey(connectionId));
    if (raw) {
      const parsed = JSON.parse(raw) as Snippet[];
      if (Array.isArray(parsed)) user = parsed.filter((s) => !s.builtin);
    }
  } catch {
    // ignore
  }
  return [...BUILTINS, ...user];
}

export function saveUserSnippet(
  connectionId: string,
  title: string,
  body: string,
): Snippet[] {
  const all = listSnippets(connectionId).filter((s) => !s.builtin);
  const next: Snippet = {
    id: `user-${Date.now()}`,
    title: title.trim() || "Snippet",
    body,
  };
  const user = [next, ...all];
  localStorage.setItem(storageKey(connectionId), JSON.stringify(user));
  return listSnippets(connectionId);
}

export function deleteUserSnippet(
  connectionId: string,
  id: string,
): Snippet[] {
  const user = listSnippets(connectionId)
    .filter((s) => !s.builtin && s.id !== id);
  localStorage.setItem(storageKey(connectionId), JSON.stringify(user));
  return listSnippets(connectionId);
}
