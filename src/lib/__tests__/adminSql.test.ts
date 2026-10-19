import { describe, expect, it } from "vitest";
import {
  adminSql,
  adminSupported,
  createUserSql,
  dropUserSql,
  fmtUptime,
  grantsSql,
  isMysqlFamily,
  kvMap,
} from "@/lib/adminSql";

describe("adminSql", () => {
  it("detects mysql family and supported engines", () => {
    expect(isMysqlFamily("mysql")).toBe(true);
    expect(isMysqlFamily("postgres")).toBe(false);
    expect(adminSupported("mariadb")).toBe(true);
    expect(adminSupported("sqlite")).toBe(false);
  });

  it("returns processlist SQL for mysql and postgres", () => {
    expect(adminSql("mysql", "processes")[0]).toMatch(/PROCESSLIST/i);
    expect(adminSql("postgres", "processes")[0]).toMatch(/pg_stat_activity/);
  });

  it("returns serverStatus queries for mysql", () => {
    const sqls = adminSql("mysql", "serverStatus");
    expect(sqls.length).toBeGreaterThanOrEqual(3);
    expect(sqls[0]).toMatch(/VERSION/i);
  });

  it("builds user DDL", () => {
    expect(grantsSql("mysql", "ada", "%")).toContain("SHOW GRANTS");
    expect(dropUserSql("mysql", "ada", "%")).toContain("DROP USER");
    expect(createUserSql("mysql", { user: "u", host: "%", password: "p", grantDb: "db" })).toMatch(
      /CREATE USER/,
    );
  });

  it("kvMap and fmtUptime", () => {
    expect(
      kvMap({
        columns: ["n", "v"],
        rows: [
          ["Uptime", "65"],
          ["Threads_connected", "3"],
        ],
        rowsAffected: null,
      }),
    ).toEqual({ Uptime: "65", Threads_connected: "3" });
    expect(fmtUptime(65)).toContain("s");
    expect(fmtUptime(3661)).toMatch(/1h/);
  });
});
