# Vision: Relation Query Builder

Product direction for an interactive, table-centric join builder under **Structure → Relations**. Distinct from Tools → EER Diagram (schema-wide reverse engineer / forward DDL).

## Goals

- Help users who know the **current table** but not the full join graph discover related tables visually.
- Let them **pick columns** on the current table and related tables and get a working `SELECT … JOIN` without writing SQL by hand.
- Support **nested** relations: expand a related table to pull in *its* parents/children and deepen the join path.
- Stay light: only load neighbors of included nodes, not the whole schema (unlike EER).

## Locked product decisions (MVP)

| Decision | Choice |
|----------|--------|
| Seed graph | Both directions: outbound FKs **and** tables that reference the root |
| SQL destination | Live preview in the pane + **Open in query tab** |
| Default join | `LEFT JOIN` (toggle to `INNER`) |
| Nesting | Expand an included neighbor to attach further FK neighbors |
| Visual | Card + edge graph inspired by EER boxes; purpose-built for query building |

## UX model

1. Open a table’s **Structure → Relations**.
2. See the **root** card (always included) and immediate related cards (out + in).
3. **Include** a related card to add it to the join path; check columns to project.
4. **Expand** an included card to discover that table’s further relations; include those for deeper queries.
5. Preview updates live; **Open in query tab** copies SQL into a new editor tab.

### Join inclusion rule

Join a table if it is **included** or is an **ancestor on the path** from the root to an included descendant (so intermediate hops still appear in `FROM`/`JOIN` even if the user only selected leaf columns).

### Column selection

- Checkboxes per included table’s columns.
- If **no** columns are selected anywhere, default the select list to the root’s `alias.*` (or all root columns) so Open always yields runnable SQL.

### Filters (WHERE)

- Optional filter rows on **included** tables: column + operator + value (AND/OR between rows).
- Same operators as the data-grid filters (`eq`, `ne`, comparisons, `like`, `is_null`, `is_not_null`).
- Incomplete rows and filters on excluded tables are omitted from SQL.

### Aliases

Stable aliases `t0` (root), `t1`, `t2`, … assigned in BFS order from the root along included edges.

## SQL shape (MVP)

```sql
SELECT t0.id, t1.name, t2.total
FROM `orders` t0
LEFT JOIN `users` t1 ON t0.user_id = t1.id
LEFT JOIN `payments` t2 ON t1.id = t2.user_id
```

- Identifiers quoted per engine (`quoteIdent`).
- Multi-column FKs → `AND`-chained ON predicates.
- No `WHERE` / `GROUP BY` / aggregates in MVP.

## Inbound FK discovery

Outbound FKs come from `describe_table`. Inbound FKs use a catalog query (or SQLite scan) so we do not describe every table in the schema up front. Expanding a node repeats neighbor discovery for that table.

## Limits (MVP)

- Cap neighbor fan-out / expand depth in the UI if graphs get huge (soft limit; show a note).
- No editing of FK metadata here (use Alter Table).
- No automatic run of the preview (Open → user runs in the query tab).

## Future enhancements (not MVP)

- Save generated SQL as a view or snippet
- Richer filter UI (date pickers, IN lists, between)
- Suggest join cardinality labels (1:N / N:1) on edges
- Drag to reorder select list / pick join type per edge
- “Explain this join” → Visual Explain
- Reverse path: start from a desired result column set and propose a join tree
- Shareable builder state in the connection’s local storage

## Relationship to EER Diagram

| | Relation Query Builder | Tools → EER Diagram |
|--|------------------------|---------------------|
| Scope | One root table + expanded neighbors | Schema (capped) |
| Purpose | Build `SELECT` joins | Understand / forward-engineer DDL |
| Interaction | Include, columns, expand, Open SQL | Layout, validate, generate CREATE |

Both may share layout/visual DNA; they must not share the same entry point or data-loading strategy.

## Implementation map

- `src/lib/relationGraph.ts` — nodes, edges, include, expand, layout
- `src/lib/relationInbound.ts` — inbound FK catalog SQL / parse
- `src/lib/relationQuerySql.ts` — pure SQL builder
- `src/components/RelationQueryBuilder.tsx` — Structure → Relations UI
