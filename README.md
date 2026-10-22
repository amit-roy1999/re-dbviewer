# re-dbviewer

Fast, low-resource multi-engine SQL viewer built with Tauri 2 + React.

Supports SQLite, PostgreSQL, MySQL, MariaDB, and SQL Server. Connections can use host fields or Beekeeper-style URLs, with favorites, categories, accent colors, and per-connection action permissions.

Passwords use the **OS keyring** when available, otherwise an encrypted **app vault** (never plaintext in the connections DB). **Tools → Visualize Data** builds relation queries into Vega-Lite charts.

**User documentation:** [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — features, workflows, permissions, import/export, Visualize Data, password storage, and workspace usage.

## Downloads

Prebuilt installers (Linux AppImage/deb, Windows, macOS) are published on [GitHub Releases](https://github.com/amit-roy1999/re-dbviewer/releases) when a `v*` tag is pushed (see `.github/workflows/release.yml`). Until the first tagged release, build locally:

```bash
npm ci
npm run tauri build -- --bundles appimage   # Linux
```

## Develop

```bash
npm install
npm run tauri dev
```

## Tests

```bash
npm test              # Vitest (src/lib + component RTL)
npm run test:ui       # Vitest component tests only
npm run test:rust     # cargo test in src-tauri
npm run test:e2e      # Playwright browser flows (mocked Tauri IPC)
npm run test:e2e:headed  # same, visible browser, 1 worker
npm run test:e2e:ui      # Playwright UI mode (pick & watch tests)
npm run test:all      # unit + rust + e2e
```

E2E runs the Vite UI in Chromium with a mocked Tauri `invoke` layer (no real DB). First-time setup: `npx playwright install chromium`.

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
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Full user guide (workspace, SQL editor, admin, tools, diagnostics) |
| [docs/README.md](docs/README.md) | Doc index + how to keep guides updated |
| [GOALS.md](GOALS.md) | Product goals (includes later: GitHub Releases for free downloads) |

Reporting a bug? Preferences → **Export diagnostics…** and attach the file to the GitHub issue (local log only; no passwords/SQL/hosts).
