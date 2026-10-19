export type HelpEntry = {
  keyword: string;
  title: string;
  syntax: string;
  text: string;
  example?: string;
};

const H = (
  keyword: string,
  title: string,
  syntax: string,
  text: string,
  example?: string,
): HelpEntry => ({ keyword, title, syntax, text, example });

export const SQL_HELP: HelpEntry[] = [
  H("SELECT", "SELECT", "SELECT [DISTINCT] cols FROM table [WHERE …] [GROUP BY …] [ORDER BY …] [LIMIT n]", "Reads rows from one or more tables. DISTINCT removes duplicate rows.", "SELECT id, name FROM users WHERE active = 1 ORDER BY name LIMIT 20;"),
  H("INSERT", "INSERT", "INSERT INTO table (cols) VALUES (…), (…)", "Adds rows. Omit auto-increment keys to let the database assign them.", "INSERT INTO users (name, email) VALUES ('Ada', 'ada@example.com');"),
  H("UPDATE", "UPDATE", "UPDATE table SET col = value [, …] WHERE condition", "Changes existing rows. Without WHERE every row is updated.", "UPDATE users SET active = 0 WHERE id = 7;"),
  H("DELETE", "DELETE", "DELETE FROM table WHERE condition", "Removes rows. Without WHERE every row is deleted.", "DELETE FROM sessions WHERE expires_at < NOW();"),
  H("WHERE", "WHERE", "… WHERE expr [AND|OR expr]", "Filters rows. Operators: =, <>, <, >, BETWEEN, IN, LIKE, IS NULL.", "SELECT * FROM orders WHERE total > 100 AND status IN ('paid','shipped');"),
  H("JOIN", "JOIN", "FROM a [INNER|LEFT|RIGHT|FULL] JOIN b ON a.col = b.col", "Combines rows from two tables. INNER keeps matches only; LEFT keeps all rows of the left table.", "SELECT u.name, o.total FROM users u JOIN orders o ON o.user_id = u.id;"),
  H("GROUP BY", "GROUP BY / HAVING", "GROUP BY cols [HAVING aggregate_condition]", "Groups rows for aggregates (COUNT, SUM, AVG, MIN, MAX). HAVING filters groups.", "SELECT user_id, COUNT(*) FROM orders GROUP BY user_id HAVING COUNT(*) > 3;"),
  H("ORDER BY", "ORDER BY", "ORDER BY col [ASC|DESC] [, …]", "Sorts the result. Default is ascending.", "SELECT * FROM users ORDER BY created_at DESC;"),
  H("LIMIT", "LIMIT / OFFSET", "LIMIT n [OFFSET m]  (SQL Server: SELECT TOP n / OFFSET … FETCH)", "Restricts how many rows are returned; OFFSET skips rows first.", "SELECT * FROM logs ORDER BY id DESC LIMIT 50 OFFSET 100;"),
  H("CREATE TABLE", "CREATE TABLE", "CREATE TABLE name (col type [constraints], …, PRIMARY KEY (…))", "Defines a new table.", "CREATE TABLE tags (id INTEGER PRIMARY KEY, label TEXT NOT NULL);"),
  H("ALTER TABLE", "ALTER TABLE", "ALTER TABLE t ADD COLUMN … | DROP COLUMN … | RENAME TO …", "Changes a table's structure. Supported actions vary by engine.", "ALTER TABLE users ADD COLUMN age INT;"),
  H("DROP", "DROP", "DROP TABLE|VIEW|INDEX [IF EXISTS] name", "Permanently removes an object. Cannot be undone.", "DROP TABLE IF EXISTS tmp_import;"),
  H("TRUNCATE", "TRUNCATE", "TRUNCATE TABLE name  (SQLite: DELETE FROM name)", "Removes all rows quickly and resets auto-increment on most engines.", "TRUNCATE TABLE audit_log;"),
  H("INDEX", "CREATE INDEX", "CREATE [UNIQUE] INDEX name ON table (cols)", "Speeds up lookups and sorting on the indexed columns at the cost of slower writes.", "CREATE INDEX idx_orders_user ON orders (user_id);"),
  H("VIEW", "CREATE VIEW", "CREATE [OR REPLACE] VIEW name AS SELECT …", "Stores a query under a name that you can SELECT from like a table.", "CREATE VIEW active_users AS SELECT * FROM users WHERE active = 1;"),
  H("EXPLAIN", "EXPLAIN", "EXPLAIN [ANALYZE] statement", "Shows the query plan. ANALYZE (where supported) also executes the query and reports timings.", "EXPLAIN SELECT * FROM orders WHERE user_id = 5;"),
  H("UNION", "UNION", "SELECT … UNION [ALL] SELECT …", "Concatenates results of compatible queries. UNION removes duplicates, UNION ALL keeps them.", "SELECT id FROM a UNION ALL SELECT id FROM b;"),
  H("CASE", "CASE", "CASE WHEN cond THEN x [WHEN …] ELSE y END", "Conditional expression usable anywhere a value is.", "SELECT CASE WHEN total > 100 THEN 'big' ELSE 'small' END FROM orders;"),
  H("WITH", "WITH (CTE)", "WITH name AS (SELECT …) SELECT … FROM name", "Common table expression — a named sub-query for readability or recursion.", "WITH recent AS (SELECT * FROM orders WHERE created_at > '2024-01-01') SELECT COUNT(*) FROM recent;"),
  H("BEGIN", "Transactions", "BEGIN; … COMMIT | ROLLBACK;  (SQL Server: BEGIN TRAN)", "Groups statements so they apply together. Use the toolbar Begin / Commit / Rollback buttons.", "BEGIN;\nUPDATE accounts SET balance = balance - 10 WHERE id = 1;\nCOMMIT;"),
  H("COMMIT", "COMMIT", "COMMIT", "Makes the current transaction's changes permanent."),
  H("ROLLBACK", "ROLLBACK", "ROLLBACK", "Discards the current transaction's changes."),
  H("PRIMARY KEY", "PRIMARY KEY", "col type PRIMARY KEY  |  PRIMARY KEY (a, b)", "Uniquely identifies each row; implies NOT NULL and an index."),
  H("FOREIGN KEY", "FOREIGN KEY", "FOREIGN KEY (col) REFERENCES other(col) [ON DELETE CASCADE]", "Enforces that a column's values exist in another table.", "ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);"),
  H("PROCEDURE", "CREATE PROCEDURE (MySQL)", "CREATE PROCEDURE name(params) BEGIN … END", "Stored routine called with CALL name(args). MySQL / MariaDB only.", "CREATE PROCEDURE hello() BEGIN SELECT 'hi'; END"),
  H("FUNCTION", "CREATE FUNCTION (MySQL)", "CREATE FUNCTION name(params) RETURNS type [DETERMINISTIC] BEGIN … RETURN v; END", "Stored function usable inside SELECTs. MySQL / MariaDB only."),
  H("LIKE", "LIKE", "col LIKE 'pattern'", "Pattern match: % = any run of characters, _ = one character.", "SELECT * FROM users WHERE email LIKE '%@example.com';"),
  H("IN", "IN", "col IN (v1, v2, …) | col IN (SELECT …)", "True when the value is in the list or sub-query."),
  H("EXISTS", "EXISTS", "WHERE EXISTS (SELECT 1 FROM … WHERE …)", "True when the sub-query returns at least one row."),
  H("COUNT", "Aggregates", "COUNT(*) | COUNT(col) | SUM(col) | AVG(col) | MIN(col) | MAX(col)", "Aggregate functions used with GROUP BY or on the whole table."),
];

const BY_KEY = new Map(SQL_HELP.map((h) => [h.keyword, h]));

/** Best match for a word under the cursor (e.g. "select", "join"). */
export function helpForWord(word: string): HelpEntry | null {
  const w = word.trim().toUpperCase();
  if (!w) return null;
  const direct = BY_KEY.get(w);
  if (direct) return direct;
  return (
    SQL_HELP.find((h) => h.keyword.split(" ").includes(w)) ??
    SQL_HELP.find((h) => h.title.toUpperCase().includes(w)) ??
    null
  );
}

export function searchHelp(q: string): HelpEntry[] {
  const s = q.trim().toLowerCase();
  if (!s) return SQL_HELP;
  return SQL_HELP.filter(
    (h) =>
      h.keyword.toLowerCase().includes(s) ||
      h.title.toLowerCase().includes(s) ||
      h.text.toLowerCase().includes(s),
  );
}
