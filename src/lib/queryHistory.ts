export type HistoryEntry = {
  id: string;
  at: number;
  sql: string;
  ok: boolean;
  durationMs: number;
  message: string;
};

const MAX = 80;

function key(connectionId: string) {
  return `re-dbviewer:query-history:${connectionId}`;
}

export function loadHistory(connectionId: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(key(connectionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushHistory(
  connectionId: string,
  entry: Omit<HistoryEntry, "id" | "at">,
): HistoryEntry[] {
  const next: HistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
  };
  const list = [next, ...loadHistory(connectionId)].slice(0, MAX);
  try {
    localStorage.setItem(key(connectionId), JSON.stringify(list));
  } catch {
    // quota
  }
  return list;
}
