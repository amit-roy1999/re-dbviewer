# Workbench ↔ re-dbviewer parity (master matrix)

Status: `todo` | `doing` | `done` | `partial` | `oos` | `wontfix`

Source: MySQL Workbench Manual chs 3–10 vs re-dbviewer on `feature/workbench-parity`.

## A. Preferences & chrome

| ID | Feature | Status |
|----|---------|--------|
| A1 | App preferences UI (font, wrap, tab size, LIMIT, confirm destructive) | done |
| A2 | SQL editor prefs (folded into A1) | done |
| A3 | Accessibility / high-contrast | done |
| A4 | Shortcut map — View → Keyboard shortcuts… dialog | done |
| A5 | New Window — opens Home in a new window; all windows share one Rust DB session | done |
| A6 | Disconnect shortcut + Edit clipboard | done |

## B. Connections

| ID | Feature | Status |
|----|---------|--------|
| B1 | Multi live connections | done |
| B2 | SSH tunnel UI (+ agent preference) | done |
| B3 | SSL file pickers (Browse) | done |
| B4 | Socket/pipe | done |
| B5 | OS keyring + encrypted vault fallback | done |
| B6 | Connection color on tabs — left stripe on each connection tab, top bar when active | done |
| B7 | Duplicate connection / copy URL | done |
| B8 | LDAP/Kerberos | oos |
| B9 | Remote OS management | oos |

## C. SQL development

| ID | Feature | Status |
|----|---------|--------|
| C1 | Context Help panel | done |
| C2 | Multi-statement run in editor — Run script, continue on error | done |
| C3 | Multi-result tabs | done |
| C4 | Cancel query — Stop ignores late result + server cancel (interrupt / KILL QUERY / pg_cancel_backend) | done |
| C5 | Transaction toolbar | done |
| C6 | JSON cell viewer — right-click a JSON object/array cell → View as JSON | done |
| C7 | Pin/compare results — pin one result; compare column names + row-count diff | done |
| C8 | Global table data search — max 20 tables, 5 rows each | done |
| C9 | Deeper autocomplete — views tagged; MySQL/MariaDB routines | done |
| C10 | Query bookmarks — named SQL per connection (localStorage), in the Snippets panel | done |
| C11 | Soft wrap / find in editor — soft wrap pref; `Ctrl+F` find/replace via CodeMirror search (in `basicSetup`) | done |
| C12 | Syntax gutter — no server-side prepare gutter in v1 | wontfix |
| C13 | Text Output mode beside History (WB 8.1.7) — History / Text toggle; session log of Run / Explain / script lines | done |
| C14 | Session info strip: engine, user/host, database, version (WB 8.2.2) — sidebar strip, `VERSION()` fetched once | done |

## D. Object management

| ID | Feature | Status |
|----|---------|--------|
| D1 | Full column alter DDL — rename / retype / drop / add; SQLite limited to add / rename / drop | done |
| D2 | View editor | done |
| D3 | Routine/trigger editors — MySQL/MariaDB procedures & functions; New trigger dialog (+ menu) | done |
| D4 | Event editor — MySQL/MariaDB only: name + schedule + body → CREATE EVENT (Entities + menu) | done |
| D5 | Schema inspector — table list with approx / capped exact row counts | done |
| D6 | Table inspector | done |
| D7 | Create/drop schema | done |
| D8 | Rename table | done |
| D9 | Index editor | done |
| D10 | FK editor | done |
| D11 | Extra code gen — Generate UPDATE / DELETE (`WHERE pk = ?`) | done |
| D12 | Table Editor partitions / options (MySQL) lite (WB 8.1.10.6–7) — Advanced tab: ENGINE, CHARSET executed; PARTITION BY as comment hint | done |

## E. Results & data

| ID | Feature | Status |
|----|---------|--------|
| E1 | Multi-table import/export wizard — table checklist dumped to one SQL file (File / Entities / gear); no multi-CSV | done |
| E2 | CSV replace in UI | done |
| E3 | Export JSON/Markdown/INSERT | done |
| E4 | Import JSON — array of objects into the open table; keys matched to columns | done |
| E5 | Schema dump/restore | done |
| E6 | Batch apply edits — "Batch edits" queue + Apply N changes in BEGIN/COMMIT | done |
| E7 | Copy as JSON/MD/INSERT | done |

## F. Admin (engine-gated)

Workbench-style **Administration** mode: click the connection name in the Workspace sidebar (or Tools → Server Admin). Left nav groups **Management / Instance / Performance**.

| ID | Feature | Status |
|----|---------|--------|
| F1 | Server status — dashboard (host/version/uptime, metric cards, features, directories) | done |
| F2 | Variables browser — Status and System Variables (status + variables side by side) | done |
| F3 | Process list + kill — Client Connections | done |
| F4 | Users & grants — Users and Privileges (Grants, Drop, New user; no revoke) | done |
| F5 | Server logs — log variables + MySQL `error_log` / PG log settings | done |
| F6 | Options file editor — stub (no server FS access over SQL) | oos |
| F7 | Service control — Startup/Shutdown stub (cannot control OS service over SQL) | oos |
| F8–F10 | Enterprise Audit/Backup/Firewall | oos |
| F11 | Data Export / Import from Admin nav (dump + restore SQL) | done |

## G. Performance

| ID | Feature | Status |
|----|---------|--------|
| G1 | Visual Explain diagram (Workbench-style SVG) | done |
| G2 | EXPLAIN ANALYZE compare — Compare plans: step counts + first cost value vs previous Explain | done |
| G3 | Perf reports — Admin → Performance Reports (tables, I/O waits, top statements) | done |
| G4 | Timing histogram — bar histogram of history durations in the History header | done |
| G5 | Perf dashboard — Admin → Performance → Dashboard (live status cards) | done |
| G6 | Performance Schema Setup — read-only consumers/instruments checklist | done |

## H. Modeling

| ID | Feature | Status |
|----|---------|--------|
| H1 | EER canvas | partial |
| H2 | Reverse engineer | done |
| H3 | Forward engineer | done |
| H4 | Schema compare/diff — tables, columns, types, index names, FK names | done |
| H5 | Table templates — name + column-defs JSON (localStorage); Entities + → New table from template | done |
| H6 | Layers/notes — EER stays simple | wontfix |
| H7 | Export diagram — EER → Export SVG | done |
| H8 | Schema validation — EER → Validate: tables without PK, FKs to missing tables | done |
| H9 | DBDoc | oos |

## I. Migration

| ID | Feature | Status |
|----|---------|--------|
| I1 | Migration wizard MVP | partial |
| I2 | Type mapping — editable rules table in the wizard; used for cross-engine CREATE TABLE | done |
| I3 | Bulk copy progress — "table i/n, rows copied" line while migrating | done |
| I4 | HeatWave | oos |

## J. Extensibility

| ID | Feature | Status |
|----|---------|--------|
| J1 | Plugins / scripting | oos |

## Gap-feature notes (B1–B7, F1–F4, G1/G3, H1–H4, I1)

| ID | Shipped | Limits |
|----|---------|--------|
| B1 | Rust `SessionState` is a `HashMap<connection id, session>` plus an "active" id. `open_connection` adds a session and activates it; `set_active_connection`, `list_open_connections`, `close_connection(connectionId?)` added. `list_schema`, `describe_table`, `run_sql`, `run_sql_script`, `export_table_sql` take an optional `connectionId` (default = active). App shows a tab strip; each connection keeps its own mounted `Workspace`. | Other workspace commands (preview, import, CSV export) still act on the active connection only; hidden tabs must not issue them. |
| B2 | Form fields `sshHost/Port/User/KeyPath` + Browse + `sshUseAgent`; tunnel = system `ssh -N -L` (BatchMode), local port auto, killed on disconnect. | Needs `ssh` on PATH; no interactive password prompt; host-key `accept-new`. |
| B3 | `sslMode`, `sslCa`, `sslCert`, `sslKey`. Postgres: TLS via native-tls with CA + client cert/key (PEM). MySQL/MariaDB: TLS with optional CA (`verify-*` modes verify). | MySQL client cert/key are stored but not used (driver needs PKCS#12). SQL Server ignores SSL fields. `require` does not verify the server cert. |
| B4 | `socketPath`: MySQL socket file / Postgres socket directory. | Unix only; ignored when an SSH tunnel is set. |
| B5 | Passwords go to the OS keyring (`keyring` crate, service `re-dbviewer`, key = connection id) when available; else encrypted app vault (Argon2id + AES-256-GCM). Config JSON keeps `passwordInKeyring` / `passwordInVault` flags only — **no plaintext**. Home **Store in Vault** checkbox (Workbench-style); unlock dialog when vault is needed. | Vault master password is local-only and session-scoped after unlock. Legacy plaintext migrates on list/save when keyring or unlocked vault can accept it. Copy URL may still include a hydrated session password. |
| B7 | Card menu **Duplicate** (`duplicate_connection`, name + " (copy)") and **Copy URL**. | — |
| F1–F4, G3 | **Tools → Server Admin** (MySQL/MariaDB/Postgres): Processes (+Kill), Status, Variables, Users (+Grants, New user), Performance (largest tables, MySQL I/O waits / PG `pg_stat_user_tables`); all tables are searchable. | Logs tab is best-effort (MySQL 8.0.22+ `error_log`; elsewhere variables / settings only). No revoke. Kill / create / drop user need the DDL permission on the connection. Top-statements reports need `performance_schema` (MySQL) or `pg_stat_statements` (PG). |
| G1 | **Visual Explain** SVG diagram (Workbench-style): color-coded access boxes, join diamonds, cost/rows badges; Postgres JSON, MySQL tabular, SQLite QUERY PLAN. | Not pixel-identical to WB; layout is top-down tree. |
| H1/H2 | **Tools → EER Diagram**: reverse engineer tables + FKs into SVG boxes with relation lines; drag layout; add/remove FK → pending ALTER DDL. | Max 80 tables; SQLite FK alter is comment-only; apply is via query tab (not auto-run). |
| H3 | Forward engineer: CREATE TABLE / FK / index script into a query tab (or clipboard). | Types are emitted as reported by the source engine (no cross-dialect mapping; see I2 for migration). |
| H4 | **Tools → Schema Compare**: current schema vs other schema / other connection / `.sql` file; lists missing tables, missing columns, type differences. | Index / FK *names* are compared only for schema / connection sides (not `.sql` files, not index columns); SQL-file parsing is heuristic. |
| I1 | **Tools → Migration Wizard**: pick source + target saved connections, select tables, create tables (source DDL) and copy data in batches. | Cross-engine: only mapped types, NOT NULL and PK are created (no defaults / auto-increment / indexes / FKs); progress is a text line, not a bar; tables are created unqualified in the target default schema. |

### Beyond Workbench (shipped)

| Feature | Notes |
|---------|--------|
| **Tools → Visualize Data** | Relation-query → Vega-Lite charts (dialog + workspace tab); `.rdbviz.json` recipes; export `.vl.json`. Not a Workbench parity ID. |
| **Tools → Data Compare** | Row-level only-in-A / only-in-B / value diffs by key columns (capped rows). Not a Workbench parity ID. |
| **Fake Data Factory** | Synthetic seed tool (see USER_GUIDE / vision doc). |

## Docs crawl note (2026-10-17)

Nested Workbench manual URLs consulted for this gap pass:

- https://dev.mysql.com/doc/workbench/en/ (TOC chs 3–10, Appx B/C)
- https://dev.mysql.com/doc/workbench/en/wb-sql-editor.html (8.1)
- https://dev.mysql.com/doc/workbench/en/wb-admin.html (6)
- https://dev.mysql.com/doc/workbench/en/wb-table-editor.html (8.1.10 partitions/options/triggers)

Actionable upgrades this pass (all shipped → `done`): A4, B6, C13, C14, D3, D5, D11, D12, E1, E6, F4, G2, G3, H4.

Hard-limit partials left documented only: H1, I1.

## Already done (Phases 1–3 baseline)

Multi query tabs, Open/Save SQL, Run selection, History, Format, Snippets, autocomplete (basic), Explain chart, page size, form view, find-in-page, editable query results, reconnect, Table Editor create/ADD COLUMN, tree Drop/Truncate/Generate SELECT/INSERT, object info strip.
