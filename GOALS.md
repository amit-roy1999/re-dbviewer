# re-dbviewer goals

- **Fast to use** — few clicks from launch to data
- **Low resource usage** — light UI, paginated queries, one live DB connection
- **Good UI/UX** — dense SQL-tool layout; keyboard where it helps
- **Multi-engine** — SQLite, PostgreSQL, MySQL/MariaDB, SQL Server
- **Documented** — keep [docs/USER_GUIDE.md](docs/USER_GUIDE.md) aligned with shipped features so it can become public user docs
- **Product vision** — longer-horizon UX (e.g. [docs/VISION_RELATION_QUERY_BUILDER.md](docs/VISION_RELATION_QUERY_BUILDER.md), [docs/VISION_FAKE_DATA_FACTORY.md](docs/VISION_FAKE_DATA_FACTORY.md)) lives in `docs/` so later work can enhance against a written target
- **Free downloads** — GitHub Releases + `.github/workflows/release.yml` (tag `v*`) publish AppImage/deb, Windows, and macOS installers; source builds remain documented in the README
