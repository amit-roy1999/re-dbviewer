/** Engine-specific admin queries (MySQL/MariaDB + PostgreSQL). */
export type AdminTab =
  | "processes"
  | "status"
  | "variables"
  | "users"
  | "performance"
  | "logs";

const MYSQL_SYS = "'mysql','information_schema','performance_schema','sys'";

export const isMysqlFamily = (e: string) => e === "mysql" || e === "mariadb";
export const adminSupported = (e: string) => isMysqlFamily(e) || e === "postgres";

export function adminSql(engine: string, tab: AdminTab): string[] {
  const my = isMysqlFamily(engine);
  switch (tab) {
    case "processes":
      return [
        my
          ? "SHOW FULL PROCESSLIST"
          : "SELECT pid::text AS pid, usename::text AS usename, datname::text AS datname, state::text AS state, wait_event_type::text AS wait_event_type, (now() - query_start)::text AS duration, left(query, 300) AS query FROM pg_stat_activity WHERE pid <> pg_backend_pid() ORDER BY query_start NULLS LAST",
      ];
    case "status":
      return [
        my
          ? "SHOW GLOBAL STATUS"
          : "SELECT 'version' AS name, version() AS value UNION ALL SELECT 'uptime', (now() - pg_postmaster_start_time())::text UNION ALL SELECT 'current_database', current_database()::text UNION ALL SELECT 'connections', count(*)::text FROM pg_stat_activity UNION ALL SELECT 'db_size', pg_size_pretty(pg_database_size(current_database()))::text UNION ALL SELECT d.datname || ' ' || c.col, c.val FROM pg_stat_database d CROSS JOIN LATERAL (VALUES ('commits', d.xact_commit::text), ('rollbacks', d.xact_rollback::text), ('blks_read', d.blks_read::text), ('blks_hit', d.blks_hit::text), ('deadlocks', d.deadlocks::text), ('tup_inserted', d.tup_inserted::text), ('tup_updated', d.tup_updated::text), ('tup_deleted', d.tup_deleted::text)) AS c(col, val) WHERE d.datname IS NOT NULL",
      ];
    case "variables":
      return [
        my
          ? "SHOW GLOBAL VARIABLES"
          : "SELECT name::text AS name, setting::text AS value, coalesce(unit,'')::text AS unit, category::text AS category FROM pg_settings ORDER BY name",
      ];
    case "users":
      return [
        my
          ? "SELECT user, host FROM mysql.user ORDER BY user, host"
          : "SELECT rolname::text AS role, rolsuper::text AS superuser, rolcreatedb::text AS createdb, rolcreaterole::text AS createrole, rolcanlogin::text AS can_login FROM pg_roles ORDER BY rolname",
      ];
    case "logs":
      return my
        ? [
            "SHOW VARIABLES LIKE '%log%'",
            // MySQL 8.0.22+; errors on MariaDB / older servers and is shown as a message.
            "SELECT logged, prio, error_code, subsystem, data FROM performance_schema.error_log ORDER BY logged DESC LIMIT 200",
          ]
        : [
            "SELECT name::text AS name, setting::text AS value FROM pg_settings WHERE name LIKE 'log%' ORDER BY name",
            "SELECT pg_current_logfile()::text AS current_logfile, current_setting('data_directory') AS data_directory",
          ];
    case "performance":
      return my
        ? [
            "SELECT VERSION() AS version, NOW() AS server_time",
            "SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime','Threads_connected','Threads_running','Questions','Slow_queries')",
            `SELECT table_schema, table_name, table_rows, ROUND((data_length+index_length)/1024/1024,2) AS size_mb, ROUND(data_free/1024/1024,2) AS free_mb FROM information_schema.tables WHERE table_schema NOT IN (${MYSQL_SYS}) AND table_type = 'BASE TABLE' ORDER BY (data_length+index_length) DESC LIMIT 25`,
            `SELECT object_schema, object_name, count_star AS io_ops, ROUND(sum_timer_wait/1000000000000,3) AS wait_s FROM performance_schema.table_io_waits_summary_by_table WHERE object_schema NOT IN (${MYSQL_SYS}) ORDER BY sum_timer_wait DESC LIMIT 25`,
            // G3: needs performance_schema (default on in MySQL 5.6+; often off in MariaDB).
            "SELECT LEFT(digest_text, 120) AS statement, schema_name, count_star AS calls, ROUND(sum_timer_wait/1000000000000,3) AS total_s, ROUND(avg_timer_wait/1000000000000,6) AS avg_s, sum_rows_examined AS rows_examined FROM performance_schema.events_statements_summary_by_digest WHERE digest_text IS NOT NULL ORDER BY sum_timer_wait DESC LIMIT 15",
          ]
        : [
            "SELECT version()::text AS version, (now() - pg_postmaster_start_time())::text AS uptime, (SELECT count(*) FROM pg_stat_activity)::text AS connections",
            "SELECT schemaname::text AS schema, relname::text AS table, seq_scan::text AS seq_scan, idx_scan::text AS idx_scan, n_live_tup::text AS live_rows, n_dead_tup::text AS dead_rows, pg_size_pretty(pg_total_relation_size(relid))::text AS total_size FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 25",
            // G3: needs the pg_stat_statements extension (PG 13+ column names).
            "SELECT left(query, 120)::text AS statement, calls::text AS calls, round(total_exec_time::numeric, 1)::text AS total_ms, round(mean_exec_time::numeric, 2)::text AS mean_ms, rows::text AS rows FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 15",
          ];
  }
}

export const sqlStr = (s: string) => `'${s.split("'").join("''")}'`;

export function grantsSql(engine: string, user: string, host?: string): string {
  return isMysqlFamily(engine)
    ? `SHOW GRANTS FOR ${sqlStr(user)}@${sqlStr(host ?? "%")}`
    : `SELECT grantee::text AS grantee, table_schema::text AS schema, table_name::text AS table, privilege_type::text AS privilege FROM information_schema.role_table_grants WHERE grantee = ${sqlStr(user)} ORDER BY 2,3,4`;
}

export function dropUserSql(engine: string, user: string, host?: string): string {
  return isMysqlFamily(engine)
    ? `DROP USER ${sqlStr(user)}@${sqlStr(host ?? "%")}`
    : `DROP USER "${user.split('"').join('""')}"`;
}

export function createUserSql(
  engine: string,
  p: { user: string; host: string; password: string; grantDb: string },
): string {
  const ident = (s: string) => `"${s.split('"').join('""')}"`;
  if (isMysqlFamily(engine)) {
    const acct = `${sqlStr(p.user)}@${sqlStr(p.host || "%")}`;
    let sql = `CREATE USER ${acct} IDENTIFIED BY ${sqlStr(p.password)}`;
    if (p.grantDb.trim())
      sql += `;\nGRANT ALL PRIVILEGES ON \`${p.grantDb.trim().split("`").join("``")}\`.* TO ${acct}`;
    return sql;
  }
  let sql = `CREATE ROLE ${ident(p.user)} LOGIN PASSWORD ${sqlStr(p.password)}`;
  if (p.grantDb.trim())
    sql += `;\nGRANT ALL PRIVILEGES ON DATABASE ${ident(p.grantDb.trim())} TO ${ident(p.user)}`;
  return sql;
}
