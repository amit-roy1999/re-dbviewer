---
name: vercel-react-best-practices
description: Condensed React performance practices for re-dbviewer. Apply when changing React UI state, lists, editors, or data grids.
---

# React performance (re-dbviewer)

Adapted from Vercel React best practices — only what matters for this Tauri WebView SQL tool.

## Do

1. **Server-side pagination** — never load full tables into React; keep `LIMIT`/`OFFSET` via Tauri commands.
2. **Isolate expensive subtrees** — `ResultGrid` and CodeMirror in their own components so tree/sidebar updates do not rebuild them.
3. **Keep CodeMirror mounted** — hide the SQL pane with CSS when another tab is active; do not destroy/recreate the editor.
4. **Local state** — filter/search state stays next to the control that uses it; avoid lifting result rows into parents that also own the schema tree.
5. **Stable keys** — use column names / row indices carefully; prefer column name as `key` for headers.
6. **Memoize only when measured** — `memo`/`useMemo` for the grid if profiling shows parent re-renders thrashing large tables; do not sprinkle by default.
7. **Avoid derived state duplicates** — derive filtered schema with `useMemo` from `schema + filter`, do not store a second filtered copy in state.

## Don't

- Redux/Zustand for two screens
- Virtualization libraries until row counts demand it
- Fetching on every keystroke without debounce for search that hits the backend (local filter is fine sync)
- Putting huge result arrays in context

## Checklist before shipping a UI change

- [ ] Opening a table does not remount SQL editor
- [ ] Typing in schema search does not remount result grid unnecessarily
- [ ] No full-table fetch into memory
