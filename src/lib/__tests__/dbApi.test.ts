import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import {
  ensureOpen,
  flattenTables,
  quoteIdent,
  runSql,
  shortName,
  sqlLiteral,
  tableRef,
} from "@/lib/dbApi";
import { sampleSchema } from "./fixtures";

describe("dbApi pure helpers", () => {
  it("quotes identifiers per engine", () => {
    expect(quoteIdent("postgres", "a.b")).toBe('"a"."b"');
    expect(quoteIdent("mysql", "a.b")).toBe("`a`.`b`");
    expect(quoteIdent("mysql", "a`b")).toBe("`a``b`");
  });

  it("formats literals", () => {
    expect(sqlLiteral(null, "postgres")).toBe("NULL");
    expect(sqlLiteral(true, "postgres")).toBe("TRUE");
    expect(sqlLiteral(true, "mysql")).toBe("1");
    expect(sqlLiteral("O'Reilly", "postgres")).toBe("'O''Reilly'");
  });

  it("flattens tables and shortName", () => {
    expect(tableRef("main", "t", "sqlite")).toBe("t");
    expect(tableRef("public", "t", "postgres")).toBe("public.t");
    expect(flattenTables(sampleSchema, "postgres").map((t) => t.ref)).toEqual([
      "public.users",
      "public.orders",
    ]);
    expect(shortName("public.users")).toBe("users");
  });
});

describe("dbApi invoke wrappers", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("runSql passes connectionId", async () => {
    invoke.mockResolvedValue({ columns: [], rows: [], rowsAffected: null });
    await runSql("SELECT 1", "c1");
    expect(invoke).toHaveBeenCalledWith("run_sql", {
      sql: "SELECT 1",
      connectionId: "c1",
    });
  });

  it("ensureOpen opens and cleans up", async () => {
    invoke
      .mockResolvedValueOnce([]) // list_open_connections
      .mockResolvedValueOnce(undefined) // open_connection
      .mockResolvedValueOnce(undefined) // close_connection
      .mockResolvedValueOnce(undefined); // set_active_connection
    const cleanup = await ensureOpen("new", "old");
    expect(invoke).toHaveBeenCalledWith("open_connection", { id: "new" });
    await cleanup();
    expect(invoke).toHaveBeenCalledWith("close_connection", {
      connectionId: "new",
    });
    expect(invoke).toHaveBeenCalledWith("set_active_connection", {
      id: "old",
    });
  });
});
