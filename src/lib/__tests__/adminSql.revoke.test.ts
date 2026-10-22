import { describe, expect, it } from "vitest";
import {
  adminSql,
  revokeAllSql,
  roleTreeSql,
} from "@/lib/adminSql";

describe("adminSql waitEvents / revoke", () => {
  it("waitEvents SQL for mysql and postgres", () => {
    expect(adminSql("mysql", "waitEvents")[0]).toMatch(/events_waits/);
    expect(adminSql("postgres", "waitEvents")[0]).toMatch(/wait_event/);
  });

  it("replication SQL", () => {
    expect(adminSql("mysql", "replication")[0]).toMatch(/REPLICA|SLAVE/i);
    expect(adminSql("postgres", "replication")[0]).toMatch(/pg_stat_replication/);
  });

  it("revoke and role tree", () => {
    expect(revokeAllSql("mysql", "u", "%")).toMatch(/REVOKE ALL/);
    expect(revokeAllSql("postgres", "u")).toMatch(/REVOKE ALL ON SCHEMA/);
    expect(roleTreeSql("postgres")).toMatch(/pg_auth_members/);
    expect(roleTreeSql("mysql")).toMatch(/SCHEMA_PRIVILEGES/);
  });
});
