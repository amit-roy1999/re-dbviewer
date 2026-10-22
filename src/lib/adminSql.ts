/** Engine-specific admin queries (MySQL/MariaDB + PostgreSQL). */
export type AdminTab =
  | "processes"
  | "status"
  | "variables"
  | "users"
  | "performance"
  | "logs"
  | "serverStatus"
  | "perfSchemaSetup"
  | "queryMonitorRunning"
  | "queryMonitorRecent"
  | "waitEvents"
  | "replication";

/** Bucket for Query Monitor type filter chips. */
export type QueryTypeFilter = "all" | "select" | "dml" | "ddl" | "other";

export function queryTypeBucket(queryType: string): Exclude<QueryTypeFilter, "all"> {
  const t = queryType.trim().toUpperCase().replace(/[^A-Z_]/g, "");
  if (t === "SELECT" || t === "WITH" || t === "SHOW" || t === "EXPLAIN" || t === "DESCRIBE" || t === "DESC")
    return "select";
  if (t === "INSERT" || t === "UPDATE" || t === "DELETE" || t === "REPLACE" || t === "MERGE")
    return "dml";
  if (
    t === "CREATE" ||
    t === "ALTER" ||
    t === "DROP" ||
    t === "TRUNCATE" ||
    t === "RENAME" ||
    t === "GRANT" ||
    t === "REVOKE"
  )
    return "ddl";
  return "other";
}

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
            "SELECT LEFT(digest_text, 120) AS statement, schema_name, count_star AS calls, ROUND(sum_timer_wait/1000000000000,3) AS total_s, ROUND(avg_timer_wait/1000000000000,6) AS avg_s, sum_rows_examined AS rows_examined FROM performance_schema.events_statements_summary_by_digest WHERE digest_text IS NOT NULL ORDER BY sum_timer_wait DESC LIMIT 15",
          ]
        : [
            "SELECT version()::text AS version, (now() - pg_postmaster_start_time())::text AS uptime, (SELECT count(*) FROM pg_stat_activity)::text AS connections",
            "SELECT schemaname::text AS schema, relname::text AS table, seq_scan::text AS seq_scan, idx_scan::text AS idx_scan, n_live_tup::text AS live_rows, n_dead_tup::text AS dead_rows, pg_size_pretty(pg_total_relation_size(relid))::text AS total_size FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 25",
            "SELECT left(query, 120)::text AS statement, calls::text AS calls, round(total_exec_time::numeric, 1)::text AS total_ms, round(mean_exec_time::numeric, 2)::text AS mean_ms, rows::text AS rows FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 15",
          ];
    case "serverStatus":
      return my
        ? [
            "SELECT VERSION() AS version, @@hostname AS hostname, @@port AS port, @@version_comment AS version_comment, @@version_compile_os AS compile_os, @@version_compile_machine AS compile_machine",
            "SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime','Threads_connected','Threads_running','Questions','Slow_queries','Bytes_received','Bytes_sent','Com_select','Innodb_buffer_pool_pages_total','Innodb_buffer_pool_pages_free','Innodb_data_reads','Innodb_data_writes','Key_read_requests','Key_reads')",
            "SHOW GLOBAL VARIABLES WHERE Variable_name IN ('basedir','datadir','plugin_dir','tmpdir','socket','port','performance_schema','have_ssl','have_openssl','general_log','slow_query_log','log_error','version','version_comment')",
            "SHOW PLUGINS",
          ]
        : [
            "SELECT version()::text AS version, inet_server_addr()::text AS host, inet_server_port()::text AS port, current_setting('data_directory') AS datadir, current_setting('config_file') AS config_file, (now() - pg_postmaster_start_time())::text AS uptime",
            "SELECT 'connections' AS name, count(*)::text AS value FROM pg_stat_activity UNION ALL SELECT 'db_size', pg_size_pretty(pg_database_size(current_database()))::text",
            "SELECT name::text AS name, setting::text AS value FROM pg_settings WHERE name IN ('data_directory','config_file','log_directory','port','ssl','shared_preload_libraries') ORDER BY name",
          ];
    case "perfSchemaSetup":
      return my
        ? [
            "SELECT @@performance_schema AS performance_schema_enabled",
            "SELECT NAME AS consumer, ENABLED FROM performance_schema.setup_consumers ORDER BY NAME",
            "SELECT NAME AS instrument, ENABLED, TIMED FROM performance_schema.setup_instruments WHERE NAME LIKE 'statement/%' OR NAME LIKE 'wait/io/table/%' OR NAME LIKE 'memory/%' ORDER BY NAME LIMIT 200",
          ]
        : [
            "SELECT name::text AS name, setting::text AS setting FROM pg_settings WHERE name LIKE '%stat%' OR name = 'shared_preload_libraries' ORDER BY name",
            "SELECT extname::text AS extension, extversion::text AS version FROM pg_extension WHERE extname IN ('pg_stat_statements') ORDER BY 1",
          ];
    case "queryMonitorRunning":
      return [
        my
          ? `SELECT ID AS id, USER AS user, HOST AS host, DB AS db, COMMAND AS command, TIME AS duration_s, STATE AS state, UPPER(SUBSTRING_INDEX(TRIM(INFO), ' ', 1)) AS query_type, LEFT(INFO, 500) AS query FROM information_schema.PROCESSLIST WHERE COMMAND <> 'Sleep' AND INFO IS NOT NULL AND TRIM(INFO) <> '' ORDER BY TIME DESC`
          : `SELECT pid::text AS id, usename::text AS user, coalesce(client_addr::text, client_hostname::text, '') AS host, datname::text AS db, state::text AS state, (now() - query_start)::text AS duration, upper(split_part(trim(query), ' ', 1)) AS query_type, left(query, 500) AS query FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state IS DISTINCT FROM 'idle' AND query IS NOT NULL AND btrim(query) <> '' AND query NOT ILIKE 'IDLE' ORDER BY query_start NULLS LAST`,
      ];
    case "queryMonitorRecent":
      return [
        my
          ? `SELECT LEFT(digest_text, 200) AS statement, schema_name AS db_schema, count_star AS calls, ROUND(sum_timer_wait/1000000000000,3) AS total_s, ROUND(avg_timer_wait/1000000000000,6) AS avg_s, sum_rows_examined AS rows_examined, UPPER(SUBSTRING_INDEX(TRIM(digest_text), ' ', 1)) AS query_type FROM performance_schema.events_statements_summary_by_digest WHERE digest_text IS NOT NULL ORDER BY sum_timer_wait DESC LIMIT 50`
          : `SELECT left(query, 200)::text AS statement, calls::text AS calls, round(total_exec_time::numeric, 1)::text AS total_ms, round(mean_exec_time::numeric, 2)::text AS avg_ms, rows::text AS rows, upper(split_part(trim(query), ' ', 1)) AS query_type FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 50`,
      ];
    case "waitEvents":
      return my
        ? [
            `SELECT EVENT_NAME AS wait_event, COUNT_STAR AS waits, ROUND(SUM_TIMER_WAIT/1000000000000,3) AS wait_s FROM performance_schema.events_waits_summary_global_by_event_name WHERE COUNT_STAR > 0 ORDER BY SUM_TIMER_WAIT DESC LIMIT 40`,
            `SELECT OBJECT_TYPE, OBJECT_SCHEMA, OBJECT_NAME, COUNT_STAR AS waits, ROUND(SUM_TIMER_WAIT/1000000000000,3) AS wait_s FROM performance_schema.table_io_waits_summary_by_table WHERE OBJECT_SCHEMA NOT IN (${MYSQL_SYS}) ORDER BY SUM_TIMER_WAIT DESC LIMIT 25`,
          ]
        : [
            `SELECT coalesce(wait_event_type,'(none)')::text AS wait_event_type, coalesce(wait_event,'(none)')::text AS wait_event, count(*)::text AS sessions FROM pg_stat_activity WHERE pid <> pg_backend_pid() GROUP BY 1,2 ORDER BY count(*) DESC`,
            `SELECT wait_event_type::text AS wait_event_type, wait_event::text AS wait_event, state::text AS state, left(query, 200)::text AS query FROM pg_stat_activity WHERE wait_event IS NOT NULL AND pid <> pg_backend_pid() ORDER BY query_start NULLS LAST LIMIT 40`,
          ];
    case "replication":
      return my
        ? [
            "SHOW REPLICA STATUS",
            "SHOW MASTER STATUS",
            "SELECT CHANNEL_NAME, SERVICE_STATE, LAST_ERROR_MESSAGE FROM performance_schema.replication_connection_status",
          ]
        : [
            "SELECT pid::text AS pid, usename::text AS usename, application_name::text AS application_name, client_addr::text AS client_addr, state::text AS state, sync_state::text AS sync_state, replay_lag::text AS replay_lag FROM pg_stat_replication",
            "SELECT slot_name::text AS slot_name, plugin::text AS plugin, slot_type::text AS slot_type, active::text AS active FROM pg_replication_slots",
            "SELECT pg_is_in_recovery()::text AS in_recovery, pg_last_wal_receive_lsn()::text AS receive_lsn, pg_last_wal_replay_lsn()::text AS replay_lsn",
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

/** Revoke all privileges on *.* / PUBLIC tables (lite). */
export function revokeAllSql(
  engine: string,
  user: string,
  host?: string,
): string {
  if (isMysqlFamily(engine)) {
    const acct = `${sqlStr(user)}@${sqlStr(host ?? "%")}`;
    return `REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${acct}`;
  }
  const ident = `"${user.split('"').join('""')}"`;
  return `REVOKE ALL ON SCHEMA public FROM ${ident};\nREVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ident}`;
}

/** Role membership tree (Postgres) or privilege summary (MySQL). */
export function roleTreeSql(engine: string): string {
  return isMysqlFamily(engine)
    ? `SELECT GRANTEE, TABLE_SCHEMA, PRIVILEGE_TYPE FROM information_schema.SCHEMA_PRIVILEGES ORDER BY GRANTEE, TABLE_SCHEMA, PRIVILEGE_TYPE LIMIT 500`
    : `SELECT r.rolname::text AS role, m.rolname::text AS member_of
       FROM pg_auth_members am
       JOIN pg_roles r ON r.oid = am.member
       JOIN pg_roles m ON m.oid = am.roleid
       ORDER BY 1, 2`;
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

/** Map status/variable rows (name,value) into a lookup. */
export function kvMap(result: { columns: string[]; rows: unknown[][] } | null): Record<string, string> {
  if (!result?.rows.length) return {};
  const out: Record<string, string> = {};
  for (const row of result.rows) {
    const k = String(row[0] ?? "");
    const v = row[1] == null ? "" : String(row[1]);
    if (k) out[k] = v;
  }
  return out;
}

export function fmtUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (m || h || d) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}
