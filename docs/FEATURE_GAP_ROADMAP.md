# Feature gap roadmap

Status: `todo` | `doing` | `done` | `skip`

Tracks competitive gaps vs DBeaver / DataGrip / TablePlus / Beekeeper / Workbench / peers. Execute in ID order; do not start the next ID until the current one is `done` with tests green.

## Skip

| Item | Reason |
|------|--------|
| LDAP/Kerberos | OOS |
| Remote OS service control / options file on server FS | Impossible over SQL alone |
| Enterprise audit/backup/firewall, HeatWave | OOS |
| Plugins/scripting API (v1), mobile companion | OOS |
| Mongo/Redis/NoSQL; Oracle/ClickHouse/etc. | Separate engine epic |
| Team cloud sync of connections | Needs backend product |

## P0

| ID | Feature | Status |
|----|---------|--------|
| P0.1 | True query cancel (server-side) | done |
| P0.2 | Deeper SQL autocomplete | done |
| P0.3 | Visual query builder (MVP) | done |
| P0.4 | Safe / production mode | done |
| P0.5 | SSH/SSL polish | done |
| P0.6 | Richer cells + Excel | done |
| P0.7 | Row-level data compare | done |
| P0.8 | Interactive EER edit | done |
| P0.9 | Installers / Releases | done |

## P1

| ID | Feature | Status |
|----|---------|--------|
| P1.1 | Dump/restore wizard + progress | done |
| P1.2 | Schema+data sync lite | done |
| P1.3 | PG extensions / sequences / matviews | done |
| P1.4 | Check constraints + generated columns | done |
| P1.5 | Profiler / wait-event view | done |
| P1.6 | REVOKE / role tree | done |
| P1.7 | Persistent query tabs | done |
| P1.8 | Multi-window sessions (or document + reconnect) | done |
| P1.9 | Connection health heartbeat | done |
| P1.10 | More import/export formats | done |

## P2

| ID | Feature | Status |
|----|---------|--------|
| P2.1 | Spatial / GIS cell preview | done |
| P2.2 | Pivot / crosstab results | done |
| P2.3 | Pending-DDL code review diff | done |
| P2.4 | Query notebooks | done |
| P2.5 | AI SQL assistant (opt-in) | done |
| P2.6 | Backup scheduler | done |
| P2.7 | Replication/topology view | done |
| P2.8 | Git integration for SQL | done |
| P2.9 | Refactor rename with dependents | done |
| P2.10 | Print/PDF report | done |
