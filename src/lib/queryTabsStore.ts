/** Persist SQL query tab bodies across app restarts (per connection). */

const KEY = "re-dbviewer.query-tabs.v1";

export type StoredSqlTab = {
  id: string;
  title?: string;
  sql: string;
};

export type StoredTabsPayload = {
  connectionId: string;
  activeId: string | null;
  tabs: StoredSqlTab[];
};

export function loadStoredSqlTabs(connectionId: string): StoredTabsPayload | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as Record<string, StoredTabsPayload>;
    const p = all[connectionId];
    if (!p?.tabs?.length) return null;
    return p;
  } catch {
    return null;
  }
}

export function saveStoredSqlTabs(payload: StoredTabsPayload): void {
  try {
    const raw = localStorage.getItem(KEY);
    const all = (raw ? JSON.parse(raw) : {}) as Record<string, StoredTabsPayload>;
    all[payload.connectionId] = {
      connectionId: payload.connectionId,
      activeId: payload.activeId,
      tabs: payload.tabs.slice(0, 20).map((t) => ({
        id: t.id,
        title: t.title,
        sql: t.sql.slice(0, 200_000),
      })),
    };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota / private mode */
  }
}
