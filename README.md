# re-dbviewer

Fast, low-resource multi-engine SQL viewer built with Tauri 2 + React.

Supports SQLite, PostgreSQL, MySQL, MariaDB, and SQL Server. Connections can use host fields or Beekeeper-style URLs, with favorites, categories, accent colors, and per-connection action permissions.

## Develop

```bash
npm install
npm run tauri dev
```

## Build (Linux AppImage)

```bash
npm run tauri build -- --bundles appimage
```
