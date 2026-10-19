# Vision: Fake Data Factory

Tools → **Fake Data Factory** fills selected tables (and related ones) with synthetic rows for demos, load tests, and local development. Generation runs in **Rust** for throughput; the UI is a guided wizard.

## Goals

- Let users seed **lots** of realistic-looking data without writing INSERT scripts.
- Respect **foreign keys**: parents before children; FK columns draw from values produced in the same run.
- Give control: per-column generator, row counts, append vs truncate-then-fill.
- Stay safe: connection INSERT/DELETE permissions, confirm before truncate, hard caps on volume.

## Locked MVP decisions

| Decision | Choice |
|----------|--------|
| UX | Full guided wizard (tables → columns → mode → run) |
| Write modes | **Append** or **Truncate then fill** |
| Engine | Rust batch multi-row `INSERT` via live session |
| Related tables | User can add FK neighbors (out/in) into the plan |

## Generator catalog (MVP)

| Kind | Purpose |
|------|---------|
| `auto` | Infer from SQL type + column name |
| `skip` | Omit column (identity / DEFAULT) |
| `null` | SQL NULL |
| `fixed` | Constant string/number |
| `uuid` / `bool` | UUID / boolean |
| `int` / `float` | Random in min/max |
| `sequence` | start + step per row |
| `string` / `lorem` | Random / lorem text |
| `email` / `fullName` / `firstName` / `lastName` / `phone` / `company` | Persona fields |
| `date` / `datetime` | Random temporal |
| `enum` | Pick from listed values |
| `fk` | Pick from pool of `refTable.refColumn` inserted earlier |

## FK / ordering rules

1. Edges come from column specs with `kind: fk` (and optionally discovered FKs when auto-configuring in the UI).
2. Tables are **topologically sorted**; cycles abort with a clear error.
3. After each table batch, PK/unique column values used as FK sources are stored in an in-memory pool keyed by `table.column`.

## Limits (MVP)

- ≤ 50 tables per run  
- ≤ 100_000 rows per table  
- ≤ 500_000 rows total  
- Batch size ~200 rows per INSERT statement  

## Future

- Locale packs, custom regex / patterns  
- Weighted enums, unique constraints retry  
- Progress streaming / cancel mid-run  
- Save/load factory “recipes” per connection  
- Generate into staging tables then swap  

## Implementation map

- `src-tauri/src/db/fake_data.rs` — plan types, generators, topo, execute  
- `generate_fake_data` Tauri command  
- `src/components/tools/FakeDataFactory.tsx` — wizard  
- `src/lib/fakeDataPlan.ts` — defaults / related-table helpers  
