# re-dbviewer

**A fast, low-resource SQL workbench** for SQLite, PostgreSQL, MySQL, MariaDB, and SQL Server — built with Tauri 2 + React.

Browse schema, edit data, write SQL, explore relationships, and chart results without a heavy IDE.

<p align="center">
  <a href="https://github.com/amit-roy1999/re-dbviewer/releases/latest"><img src="https://img.shields.io/github/v/release/amit-roy1999/re-dbviewer?style=for-the-badge&label=Download" alt="Latest release" /></a>
  <a href="https://github.com/amit-roy1999/re-dbviewer/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/amit-roy1999/re-dbviewer/release.yml?style=for-the-badge&label=Installers" alt="Release build" /></a>
  <a href="https://github.com/amit-roy1999/re-dbviewer/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/amit-roy1999/re-dbviewer/ci.yml?branch=main&style=for-the-badge&label=CI" alt="CI" /></a>
</p>

<p align="center">
  <a href="#download"><b>Download</b></a> ·
  <a href="#demo">Demo</a> ·
  <a href="#features">Features</a> ·
  <a href="#develop">Develop</a> ·
  <a href="docs/USER_GUIDE.md">User guide</a>
</p>

---

## Download

Prebuilt installers for **Linux**, **Windows**, and **macOS** are published on every `v*` tag via [GitHub Actions](.github/workflows/release.yml) (free CI builds — no paid signing required to try the app).

### Get the latest build

| Platform | What to download |
|----------|------------------|
| **Linux** | `.AppImage` (chmod +x, then run) or `.deb` |
| **Windows** | NSIS setup (`.exe`) or `.msi` |
| **macOS** | `.dmg` |

**→ [Download latest release](https://github.com/amit-roy1999/re-dbviewer/releases/latest)**

Open the release page, expand **Assets**, and pick the file for your OS. First launch on macOS/Windows may ask you to allow an unsigned app (Gatekeeper / SmartScreen).

<details>
<summary>Build from source instead</summary>

```bash
npm ci
npm run tauri build
# Linux example:
npm run tauri build -- --bundles appimage,deb
```

</details>

---

## Demo

Quick tour (home → data grid → relation builder → Visualize Data → Visual Query Builder → Search Data):

![re-dbviewer feature tour](docs/media/demo-tour.gif)

| Relation builder | Visualize Data |
|------------------|----------------|
| ![Relation query builder](docs/media/05-relation-builder.png) | ![Visualize Data](docs/media/04-visualize-data.png) |

| Visual Query Builder | Search Data |
|----------------------|-------------|
| ![Visual Query Builder](docs/media/03-visual-query-builder.png) | ![Search Data](docs/media/06-search-data.png) |

Refresh stills/GIF: `npx playwright test e2e/demo-media.spec.ts` then rebuild `docs/media/demo-tour.gif` if needed. A longer Loom/YouTube walkthrough can replace the GIF — open a PR with the link.

---

## Features

- **Multi-engine** — SQLite · PostgreSQL · MySQL · MariaDB · SQL Server  
- **Workspace** — schema tree, paginated data grid, SQL editor, structure / relations  
- **Relation query builder** — FK graph both directions, filters, open as SQL  
- **Visualize Data** — query → Vega-Lite charts; Visual Query Builder for joins  
- **Search Data** — find values across tables; command palette for actions  
- **FK navigate & peek** — jump to or preview referenced rows from the grid  
- **Admin & tools** — query monitor, EER, schema/data compare & sync, dump/restore, Excel export  
- **Credentials** — OS keyring or encrypted vault (never plaintext in the DB)  
- **Safe mode** & server-side query cancel  

Full detail: **[docs/USER_GUIDE.md](docs/USER_GUIDE.md)**.

---

## Develop

```bash
npm install
npm run tauri dev
```

### Tests

```bash
npm test              # Vitest
npm run test:rust     # cargo test in src-tauri
npm run test:e2e      # Playwright (mocked Tauri IPC)
npm run test:all
```

### Local MySQL (Docker)

```bash
docker compose up -d
# mysql://root:redev@127.0.0.1:3306/re_dbviewer
```

---

## Docs

| Doc | Description |
|-----|-------------|
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Features, workspace, admin, tools |
| [docs/RELEASE_NOTES_v0.1.0.md](docs/RELEASE_NOTES_v0.1.0.md) | v0.1.0 release notes |
| [docs/README.md](docs/README.md) | Doc index |
| [GOALS.md](GOALS.md) | Product goals |

Reporting a bug? **Preferences → Export diagnostics…** and attach the file (no passwords / hosts / SQL).

---

## License

See repository license file if present; otherwise all rights reserved by the author until a license is added.
