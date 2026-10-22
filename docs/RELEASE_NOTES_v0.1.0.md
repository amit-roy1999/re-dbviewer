# re-dbviewer v0.1.0

First public multi-platform build of **re-dbviewer** — a fast, low-resource SQL workbench for SQLite, PostgreSQL, MySQL, MariaDB, and SQL Server.

## Download

Pick the installer for your OS from the assets below this release (built automatically by GitHub Actions):

| Platform | Asset (typical name) |
|----------|----------------------|
| **Linux** | `.AppImage` (run directly) or `.deb` (Debian/Ubuntu) |
| **Windows** | NSIS `.exe` setup or `.msi` |
| **macOS** | `.dmg` |

After install, open the app and add a connection (host fields or a Beekeeper-style URL).

## Highlights

- **Multi-engine** workspace with schema tree, data grid, SQL editor, and structure tools
- **Relation query builder** — explore FK neighbors and open join SQL
- **Visualize Data** — relation queries → Vega-Lite charts
- **Visual Query Builder**, EER diagram, schema/data compare & sync
- **Search Data** across tables; command palette; query monitor
- **Password vault / OS keyring** — credentials not stored in plaintext
- **Safe mode**, query cancel, dump/restore wizard, Excel/HTML/XML export
- **FK cell navigate + peek** — open or preview referenced rows from the grid

## Docs

- [User guide](https://github.com/amit-roy1999/re-dbviewer/blob/main/docs/USER_GUIDE.md)
- [README](https://github.com/amit-roy1999/re-dbviewer/blob/main/README.md)

## Build from source

```bash
npm ci
npm run tauri build
```

## Notes

- Unsigned macOS / Windows binaries may need Gatekeeper / SmartScreen allow on first run.
- Report bugs with **Preferences → Export diagnostics…** (no passwords in the dump).
