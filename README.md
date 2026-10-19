# re-dbviewer

Fast, low-resource multi-engine SQL viewer built with Tauri 2 + React.

Supports SQLite, PostgreSQL, MySQL, MariaDB, and SQL Server. Connections can use host fields or Beekeeper-style URLs, with favorites, categories, accent colors, and per-connection action permissions.

**User documentation:** [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — features, workflows, permissions, import/export, and workspace usage.

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

## Docs

| Doc | Description |
|-----|-------------|
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Full user guide for built features |
| [docs/README.md](docs/README.md) | Doc index + how to keep guides updated |
| [GOALS.md](GOALS.md) | Product goals |
