export type Bookmark = { id: string; title: string; body: string };

const key = (connectionId: string) => `re-dbviewer:bookmarks:${connectionId}`;

export function listBookmarks(connectionId: string): Bookmark[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(connectionId)) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Bookmark[]) : [];
  } catch {
    return [];
  }
}

function write(connectionId: string, list: Bookmark[]) {
  localStorage.setItem(key(connectionId), JSON.stringify(list));
  return list;
}

export function saveBookmark(connectionId: string, title: string, body: string) {
  const item: Bookmark = {
    id: `bm-${Date.now()}`,
    title: title.trim() || body.trim().slice(0, 30) || "Bookmark",
    body,
  };
  return write(connectionId, [item, ...listBookmarks(connectionId)]);
}

export function deleteBookmark(connectionId: string, id: string) {
  return write(
    connectionId,
    listBookmarks(connectionId).filter((b) => b.id !== id),
  );
}
