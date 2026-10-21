# re-dbviewer user guide

Fast, low-resource SQL client for local and remote databases. Built with Tauri 2.

Supported engines: **SQLite**, **PostgreSQL**, **MySQL**, **MariaDB**, **SQL Server**.

---

## Install and run

### Development

```bash
npm install
npm run tauri dev
```

### Linux AppImage

```bash
npm run tauri build -- --bundles appimage
```

### Local MySQL for testing

```bash
docker compose up -d
```

Connection URL:

```text
mysql://root:redev@127.0.0.1:3306/re_dbviewer
```

Sample tables: `users`, `orders` (with foreign key). Stop with `docker compose down`.

---

## Menu bar

Top of the window:

| Menu | Actions |
|------|---------|
| **File** | New Query Tab (`Ctrl+T`), Close Tab (`Ctrl+W`), Open SQL… (`Ctrl+O`), Save (`Ctrl+S`), Save As… (`Ctrl+Shift+S`), Export Result CSV…, Dump Schema SQL…, Dump Selected Tables…, Restore SQL File…, Preferences… (`Ctrl+,`), Reconnect, Disconnect (`Ctrl+Shift+Q`), Exit. **New Window** (`Ctrl+Shift+N`) opens another Home window (all windows share the one live DB session). |
| **Edit** | Format SQL (`Ctrl+Shift+F`), Undo / Redo (editor), Cut / Copy / Paste (act on the last focused editor or text field). |
| **Query** | Run Script (`Ctrl+Shift+Enter`), Stop, Begin / Commit / Rollback. |
| **View** | Toggle History, Snippets, Context Help; Search Data… (`Ctrl+Shift+H`); Inspect Table…; Schema Inspector…; Preferences…; **Keyboard shortcuts…**; Toggle theme. |
| **Tools** | Server Admin (Workbench Administration), EER Diagram, Schema Compare, Migration Wizard, Fake Data Factory. See [Tools](#tools) and [Administration](#administration). |

`Ctrl+T/W/O/S/Shift+S/Shift+F` also work from the keyboard (⌘ on macOS). **View → Keyboard shortcuts…** lists them all (including `Ctrl+Enter`, `Ctrl+Shift+Enter`, `Ctrl+Shift+Q`, `Ctrl+,`).

---

## Connections (Home)

The home screen lists saved connections.

### Add or edit a connection

1. Click **Add** (or edit an existing card).
2. Set **name**, **engine**, optional **category**, **favorite**, and **accent color**.
3. Enter either:
   - a **connection URL**, or
   - host / port / user / password / database (SQLite: file path + Browse).
4. Optional **SSL, socket & SSH tunnel** section (server engines):
   - **SSL mode** + CA / client cert / client key paths (PEM). PostgreSQL uses all three; MySQL/MariaDB uses the CA only (client cert/key are saved but not used).
   - **Unix socket** — MySQL socket file or PostgreSQL socket directory.
   - **SSH host / user / port / private key** — opens a tunnel with your system `ssh` (key auth only) and connects through it.
5. Choose **Allowed actions** (permissions).
6. **Test**, then **Save**.

Passwords are saved in the **OS keyring** when available (otherwise in the local app database).

### Connection URLs

| Engine | Example |
|--------|---------|
| SQLite | `sqlite:////path/to/file.db` or a bare path |
| PostgreSQL | `postgresql://user:pass@127.0.0.1:5432/dbname` |
| MySQL | `mysql://root:redev@127.0.0.1:3306/re_dbviewer` |
| MariaDB | `mariadb://user:pass@127.0.0.1:3306/dbname` |
| SQL Server | `mssql://user:pass@127.0.0.1:1433/dbname` |

URL and form fields stay in sync when you edit either.

### Library features

- **Favorites** — pin connections; shown in a separate section.
- **Categories** — organize connections; filter the library by category.
- **Accent color** — left border / workspace accent for that connection.
- Card menu: **Open**, **Test**, **Favorite**, **Edit**, **Duplicate**, **Copy URL**, **Delete**.
- **Several connections** can be open at once: opening a card adds a tab in the strip above the workspace; **Connections** returns to the library, the **×** on a tab disconnects it.
- **Restricted** badge — shown when not all SQL permissions are enabled.

### Permissions (per connection)

| Permission | Allows |
|------------|--------|
| SELECT | Read queries, schema browse, table preview, exports |
| INSERT | Insert rows, CSV import append |
| UPDATE | Inline cell edits |
| DELETE | Delete rows; CSV replace (when offered) |
| DDL | Create / alter / drop and other DDL |

The backend enforces these on SQL; the UI also disables some actions when INSERT/DELETE are off.

---

## Workspace

After you **Open** a connection you get:

1. **Left:** entity browser (schemas / tables / views) with filter. Drag the right edge of the sidebar to resize (width is remembered).
2. **Center:** tabs — one or more **Query** tabs, table **data** (`table [all]`), table **structure**, and **Table editor** tabs.
3. **Bottom:** query **Output / History** panel (collapsed by default) and the status footer (row counts, paging, page size, refresh, add row, settings).

When a query result (or Explain / script results) is showing, drag the bar between the SQL editor and the results pane to resize the editor height (also remembered).

Click a table to open data. Use the wrench (or double-click) for structure. Footer **Structure** / **Data** switches between those tabs.

Click the **connection name** in the sidebar to switch between **Objects** and **Administration** (MySQL / MariaDB / PostgreSQL). The SQL editor stays mounted while you are in Administration so it is still there when you switch back.

**Reconnect** (File menu) closes and reopens the live session, refreshes the schema, and keeps your tabs.

### Schema tree

- **Click** a table to open its data.
- **Wrench** (or double-click) opens **Structure**.
- **⋯** (or right-click) opens Beekeeper-style table actions: **View Data**, **View Structure**, **Edit table/view**, **Export To File…** (schema + data SQL), **Import from File…** (CSV append), **Copy Name**, **Hide** (session-only; **Show N hidden** in the Entities header restores them), **SQL: Create** / **SQL: Select Top** (new query tab), **Rename…** / **Drop…** / **Truncate…**, **Duplicate…** (`CREATE TABLE … AS SELECT *` / MSSQL `SELECT * INTO`), **View ERD** (Tools → EER).
- Long names truncate; wrench and `⋯` sit after the name (with a small gap) and appear on row hover (stay visible while the `⋯` menu is open).
- Refresh / create / dump actions are also in the **Entities** header icons (and File / View menus where applicable).

The **+** next to **Entities** opens the Table editor in create mode. A small info strip at the bottom of the sidebar shows the selected object, kind and column count. A **session strip** under the connection name shows engine, host / user / database (from the saved connection) and the server `VERSION()`, fetched once. Each connection tab in the top strip carries a coloured left stripe (the connection's accent colour).

### Table editor

Edit column name / type / nullability / default / PK, see the generated DDL, then **Apply**. **Type** is an engine-specific dropdown (not free text); if a column already has a type outside the list, that value stays as an option.

- **Create** — runs `CREATE TABLE`; the tab then switches to edit mode for the new table.
- **Edit** — only **new columns** are applied (`ALTER TABLE … ADD COLUMN`). Renames, type changes and drops must be done in SQL (**Open SQL in Query**).
- **Advanced** tab (MySQL / MariaDB): `ENGINE`, `DEFAULT CHARSET` (added to the `CREATE TABLE`, or as an `ALTER TABLE … ENGINE=…, DEFAULT CHARSET=…` when editing) and optional `PARTITION BY …` text, which is only shown as a commented hint in the DDL preview (not executed).
- Applying requires DDL permission on the connection.

**File → Disconnect** (or Connections back) closes the live session and returns home.

---

## SQL editor (Query tab)

- Write SQL in the CodeMirror editor. Autocomplete knows table names and (for opened / first ~30 tables) column names, using the connection's SQL dialect.
- **Casing** — keyword autocomplete and **Format** keep the casing you type (they do not force `UPPERCASE`). Table/column names follow what the database reports.
- **Dark mode** — syntax highlighting and the autocomplete popup use high-contrast colors that match the app theme.
- **Multiple query tabs** — **+** (or `Ctrl+T`) adds *Query N*. Each tab keeps its own SQL text, result, Explain output / view and Analyze setting. Close with **×** or `Ctrl+W`; at least one query tab always stays open.
- **Run** or **Ctrl/⌘+Enter** — executes the **selection** if there is one, otherwise the **statement under the cursor** (statements are split on `;`). Footer shows rows and duration.
- **Open / Save** (toolbar or File menu) — load a `.sql` file into the active query tab; Save writes back to the same path, Save As picks a new one. The tab is renamed to the file name.
- **Format** — pretty-prints the selection, or the whole editor if nothing is selected (whitespace / line breaks only; casing unchanged).
- **Snippets** (toolbar / View menu) — side panel with built-in and saved snippets. Click to insert at the cursor (`${table}` becomes the selected table). **Save editor as snippet** stores the current editor text per connection.
- **History** — **Output / History** panel at the bottom of the workspace (collapsed by default; View → Toggle History). Lists recent Run / Explain statements per connection with status and duration; click one to insert it at the cursor. The **Text** toggle beside **History** is a plain scrolling session log of OK / error lines appended on every Run / Explain / script (not saved; **Clear** empties it).
- **Export result CSV** (toolbar download icon / File menu) — saves the current query result (or Explain plan) as CSV.
- **Editable results** — if a `SELECT` reads a single known table (no joins / unions / grouping) and the result includes all of its primary-key columns, you can right-click a cell → **Edit cell** (needs UPDATE). The footer shows `editable (table)`. Other results are read-only.
- **Explain** — shows the query plan without running the statement’s normal side effects (engine `EXPLAIN` / equivalent). Plan output is kept separate from Run results.
- **Analyze** (checkbox) — when supported, uses `EXPLAIN ANALYZE` so the plan includes actual timings. Only applied for **SELECT** / **WITH** / **VALUES**; ignored for writes/DDL. Disabled on SQLite (uses `EXPLAIN QUERY PLAN` only) and on SQL Server.
- **Compare plans** — after a second Explain in the same tab, the button next to Table / Visual compares the previous and current plan: step counts and the first cost-like value (with % change).
- **Batch edits** — on an editable result or table data grid, tick **Batch edits**: cell edits are queued (highlighted) instead of run; **Apply N changes** runs one `UPDATE` per row inside `BEGIN` / `COMMIT` (rolled back and kept queued if one fails; inside your own open transaction it does not commit). **Discard** drops them. Needs UPDATE and a primary key.
- After Explain finishes: switch **Table** (grid of plan rows) or **Visual** (Workbench-style diagram: color-coded access boxes, join diamonds, cost top-left / rows top-right; click a node for details). Footer shows `Explain · N step(s)`.

### Engine notes (Explain)

| Engine | Behavior |
|--------|----------|
| SQLite | `EXPLAIN QUERY PLAN` (Analyze N/A) |
| MySQL / MariaDB | `EXPLAIN` / `EXPLAIN ANALYZE` |
| Postgres | `EXPLAIN (FORMAT JSON)` / `EXPLAIN (ANALYZE, FORMAT JSON)` — chart flattens plan nodes |
| SQL Server | Not supported in v1 — Explain shows an error |

One statement at a time for permission checks; use **Import SQL file** for multi-statement scripts (Settings or import flows). Empty editor shows shortcut hints.

---

## Preferences, scripts and productivity

- **Preferences** (File / View, `Ctrl+,`): app zoom (%), editor font size (applies live to the SQL editor), tab size, soft wrap, default LIMIT (initial rows per page), confirm DELETE / DROP / TRUNCATE, high contrast, and **Export diagnostics…**. Stored locally.
- **Zoom** — `Ctrl/⌘ + +` zoom in, `Ctrl/⌘ + -` zoom out, `Ctrl/⌘ + 0` reset (also under View). Scales the whole UI (50–200%).
- **Confirm destructive** — with the preference on, running `DROP` / `TRUNCATE` / `DELETE` from the editor (or deleting rows from the grid) asks first.
- **Run script** (`Script` button, `Ctrl+Shift+Enter`) — runs every statement in the selection (or whole editor), continuing after errors. Results appear as **Result 1..N** tabs under the editor (✓ / ✗ per statement).
- **Stop** — appears while a query runs; it ignores the late result (the server is not killed).
- **Transactions** — **Begin / Commit / Rollback** in the query toolbar (and Query menu); a `TX` badge shows while one is open. SQL Server uses `BEGIN TRAN`.
- **Search data** (magnifier in the toolbar, `Ctrl+Shift+H`) — LIKE search over the first text columns of up to 20 tables (5 rows each). Click a table to open it filtered.
- **Context help** (book icon / View menu) — keyword help for the word under the cursor, with search and *Insert example*.
- **Autocomplete** tags views and (MySQL / MariaDB) offers stored routines.
- **Export / copy** — the toolbar download menu and the data-tab gear export results as CSV, JSON, Markdown or SQL INSERTs; grid right-click menus copy rows / all rows in the same formats.

- **JSON cells** — right-click a JSON object/array cell → **View as JSON**.
- **Pin / compare** — **Pin result** above a query result; later results can **Compare pinned** (column names, row-count difference).
- **Bookmarks** — the Snippets panel has a *Bookmarks* tab: named SQL per connection, saved locally.
- **Find in editor** — `Ctrl+F` (find / replace panel).
- **Timing histogram** — tiny bars in the History header bucket query durations (<10ms … ≥1s).

### Objects

- **+ next to Entities**: New table / view / routine / database or schema. Hover a schema header for the trash icon (drop, with confirmation; SQLite has no schemas).
- Table **Structure** (wrench) and **⋯** menu (View Data / Structure, export/import, hide, SQL Create/Select Top, rename/drop/truncate/duplicate, View ERD); create objects via **+** next to Entities.
- **Table editor** has Columns / Indexes / Foreign keys tabs: rename, retype, drop and add columns, plus index and FK changes, shown in the DDL preview before **Apply**.
- **View editor** — name + SELECT body; applies `CREATE VIEW` / `CREATE OR REPLACE VIEW` (SQLite: drop + create).
- **Routine editor** (MySQL / MariaDB) — pick a routine in the sidebar list or create one; apply drops and recreates it.
- **New trigger…** (MySQL / MariaDB only, **+** menu): name, BEFORE / AFTER, INSERT / UPDATE / DELETE, table and body → `CREATE TRIGGER … FOR EACH ROW` (a body with several statements is wrapped in `BEGIN … END`).
- **Schema inspector** (database icon / View menu): lists tables with row counts — catalog estimates (≈) on MySQL / MariaDB / PostgreSQL, exact `COUNT(*)` for the first 40 tables on SQLite / SQL Server. Click a row to open the table.
- **New table from template** / **New event** (MySQL / MariaDB only) are in the **+** menu. Templates are a name plus column-defs JSON, stored locally; events take name, schedule (`EVERY 1 DAY`) and body.
- **Dump / restore** — the database icon next to Entities (or File menu) dumps all tables (schema, optionally data) into one `.sql` file; **Dump selected tables…** (also in File and the data-tab gear) shows a table checklist and dumps only the ticked tables into one file; restore runs a `.sql` file. Gear → **Import CSV (replace all rows)** deletes existing rows first (needs DELETE).

---

## Table data view

### Browse

- Preview loads **100 rows** per page by default; change **25 / 50 / 100 / 200 / 500 per page** in the footer.
- Footer: previous / next page, page size, refresh, status text.
- **Grid | JSON** toggle (above table data and query results) — JSON shows the loaded page as a pretty-printed array of row objects (read-only; respects hidden columns / find filter).
- **Find in loaded rows** — client-side text filter over the rows currently loaded on this page (all columns). Edits and deletes still act on the right underlying row.

### Filters

Top filter bar (data tab only):

- Column, operator, value.
- Operators: equals, not equals, gt/gte/lt/lte, like, is null, not null.
- **+** adds another rule; **−** removes a rule.
- Click **AND** on a rule to toggle **OR** (join with the previous rule).
- Accent search button applies filters (Enter also applies).

### Sort

Click a column header: ascending → descending → unsorted.

### Grid

- Row numbers; types and key icons in headers when metadata is loaded.
- **Hide columns** via Settings → Hide columns.
- **Inline edit:** change a cell (needs UPDATE + a primary key for WHERE).
- **Add row:** footer **+** opens an editable draft row. **✓** or Enter saves; **✕** or Esc (or footer **✕**) cancels.
- **Delete:** row / selection delete when DELETE is allowed.

### Settings (gear)

| Action | Behavior |
|--------|----------|
| Export whole table | CSV of full table (no filters) |
| Export filtered view | CSV with current filters/sort |
| Export loaded rows | CSV / JSON / Markdown / INSERTs of the rows currently loaded (current page) |
| Hide columns | Toggle column visibility in the grid |
| Import CSV (append / replace all rows) | Append into the table, or delete existing rows first (confirmation; needs DELETE) |
| Import SQL file | Run a `.sql` script statement-by-statement |
| Copy view to SQL | Builds the current `SELECT` (filters, AND/OR, sort, limit/offset) and opens it in the **Query** tab |

---

## Table structure

Open from the sidebar wrench (or double-click a table). Long names truncate; wrench/`⋯` show after the name on hover.

The structure header shows a stats line: **columns · indexes · FKs · rows · size** when available. Row counts are approximate (`~N rows`) from the catalog on MySQL / MariaDB / PostgreSQL / SQL Server; SQLite uses an exact `COUNT(*)`. Size (data + indexes) is shown for MySQL / MariaDB / PostgreSQL; omitted on SQLite / SQL Server.

Structure tab sections:

- **Columns** — name, type, nullable, default, primary key; filter columns; refresh; export schema SQL.
- **Indexes** — name, unique, columns.
- **Relations** — interactive join builder (not only a FK list):
  - Graph of the current table plus related tables in **both** directions (FKs from this table, and tables that reference it).
  - Click a related card to **include** it in the query; check columns in the side list.
  - **Expand** on a related card loads that table’s further relations for nested joins.
  - Choose **LEFT** or **INNER** join; preview SQL updates live.
  - **Filters** — optional `WHERE` rows (table, column, operator, value; AND/OR). Operators match the data grid (`=`, `≠`, `>`, `LIKE`, `IS NULL`, …). Excluding a table drops its filters.
  - **Open in query tab** (or Copy) sends the generated `SELECT` to the editor so you can run or edit it.
  - Longer product vision / future ideas: [VISION_RELATION_QUERY_BUILDER.md](VISION_RELATION_QUERY_BUILDER.md).

Metadata comes from the engine (`describe_table` / native DDL where available). Inbound FKs use catalog queries (or a SQLite pragma scan).

---

## Import and export

| Format | Direction | Notes |
|--------|-----------|--------|
| CSV | Export | Whole table or filtered view; save dialog |
| CSV | Import | Header row = column names; append into open table |
| JSON | Import | Gear → Import JSON: array of objects; keys matched to columns (case-insensitive), unknown keys ignored |
| SQL | Export | Schema and/or data (`CREATE` + `INSERT`s) |
| SQL | Import | Multi-statement file; each statement checked against permissions |

Large files: imports over ~50MB are rejected. Exports cap at a large row limit on the backend.

---

## Administration

Click the **connection name** in the left sidebar (MySQL / MariaDB / PostgreSQL) to toggle **Objects** ↔ **Administration**. Tools → **Server Admin** opens the same mode.

Left nav mirrors MySQL Workbench:

- **Management:** Server Status (dashboard), Client Connections (+ Kill), Users and Privileges (Grants / New / Drop), Status and System Variables, Data Export, Data Import/Restore
- **Instance:** Startup / Shutdown (info stub — OS service control is out of reach over SQL), Server Logs, Options File (info stub)
- **Performance:** Dashboard, Performance Reports, Performance Schema Setup (read-only)

Kill, Drop and New user need the DDL permission; the account this connection uses cannot be dropped from here.

## Tools

Open from the **Tools** menu; they act on the connection tab in front.

- **Server Admin** — opens in-workspace Administration (above).
- Other tools:
- **EER Diagram**: reverse engineers tables and foreign keys into a read-only diagram. **Forward engineer → query tab** generates CREATE TABLE / FK / index SQL from the diagram; **Copy SQL** copies it. **Validate** lists tables without a primary key and foreign keys to missing tables; **Export SVG** saves the diagram.
- **Schema Compare**: compares the current schema (A) with another schema, another saved connection, or a `.sql` file (B) and lists missing tables/columns, type differences and (when B is a schema or connection) index-name and foreign-key-name differences.
- **Migration Wizard**: choose source and target saved connections, list and tick tables, then create tables and/or copy data in batches. Same-engine pairs copy the source DDL. For different engines, tables are created from mapped column types (editable **Type mapping** rules; only NOT NULL and primary keys carry over). A progress line shows `table i/n, rows copied`. Sessions the wizard opens are closed afterwards.
- **Fake Data Factory**: seed tables with synthetic rows (Rust batch inserts).
  1. Check tables on the left (search to filter). **+ related** adds FK parents/children.
  2. Set row counts (presets or per table). Choose **Append** (keeps data; IDs continue after max) or **Clear, then fill** (needs DELETE/DDL; confirms first).
  3. Click **Generate**. Column generators default from types/names/FKs — open **Customize columns** only when you need overrides.
  - Optional seed under Advanced for reproducible runs. Caps: 50 tables, 100k rows/table, 500k total. Vision: [VISION_FAKE_DATA_FACTORY.md](VISION_FAKE_DATA_FACTORY.md).
- **Explain**: the **Visual** tab is a Workbench-style color-coded plan diagram (not a bar chart).

---

## Theme and branding

- Home and workspace theme toggles, plus **View → Toggle theme**.
- Preference is stored locally (light / dark).
- The app mark (teal grid + cursor) appears in the menu bar and on the Home header (`src/assets/logo.svg`).

---

## Diagnostics (local logs)

re-dbviewer writes a **local-only** error log while you use the app. Nothing is uploaded.

- **Where:** under the app data directory, `logs/re-dbviewer.log` (on Linux typically `~/.local/share/com.amit.re-dbviewer/logs/`). Soft-rotated when large.
- **Export:** Preferences (`Ctrl+,`) → **Export diagnostics…** → save a `.txt` file. Attach that file when filing a GitHub issue.
- **Privacy:** passwords are never logged. The export includes app/OS version, engine list, and a redacted log tail — **not** SQL text, hostnames, or usernames (redaction also strips common `password=` / `host=` / `user=` tokens and IPv4 addresses).
- **Development:** the same file is useful when reproducing bugs locally; uncaught UI errors are appended automatically.

---

## Limits and known placeholders

- Menu bar, Tools and shortcuts act on the connection tab in front.
- **Stop** only stops waiting for a query; the server may still finish it (and a long query blocks further commands until it ends).
- Routine editor is MySQL / MariaDB only (no triggers; events via New event).
- SQLite cannot change column type / nullability / default or add / drop foreign keys via ALTER (the editor emits a comment instead).
- Query-tab SQL is not persisted across app restarts (use Save); history and snippets are.
- If no OS keyring is available (e.g. no Secret Service on Linux), passwords fall back to the local app SQLite database.
- SSH tunnels need the `ssh` binary and a key file; password auth is not supported.

---

## Maintaining this guide

When you add or change a user-facing feature:

1. Update the matching section in this file.
2. If the feature is new, add a short subsection (what it does, how to use it, permissions).
3. Keep examples (URLs, Docker, shortcuts) accurate.
4. Link from the root [README.md](../README.md) if you add a new top-level doc.
