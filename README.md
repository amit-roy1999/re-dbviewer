# re-dbviewer

Fast, low-resource multi-engine SQL viewer built with Tauri 2 + React.

Supports SQLite, PostgreSQL, MySQL, MariaDB, and SQL Server. Connections can use host fields or Beekeeper-style URLs, with favorites, categories, accent colors, and per-connection action permissions.

## Develop

```bash
npm install
npm run tauri dev
```

## Local MySQL (Docker)

```bash
docker compose up -d
```

Connect in the app:

```text
mysql://root:redev@127.0.0.1:3306/re_dbviewer
```

Sample tables: `users`, `orders` (with FK). Stop with `docker compose down`.

## Build (Linux AppImage)

```bash
npm run tauri build -- --bundles appimage
```
