import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dbApi", () => ({
  describeTable: vi.fn(),
  exportTableSql: vi.fn(),
  quoteIdent: (eng: string, s: string) =>
    eng === "mysql" ? `\`${s}\`` : `"${s}"`,
  runScript: vi.fn(),
  runSql: vi.fn(),
  shortName: (ref: string) => ref.split(".").pop() ?? ref,
  sqlLiteral: (v: unknown) =>
    v === null ? "NULL" : typeof v === "string" ? `'${v}'` : String(v),
}));

import {
  describeTable,
  exportTableSql,
  runScript,
  runSql,
} from "@/lib/dbApi";
import { migrateTables } from "@/lib/migrate";

const describeTableMock = vi.mocked(describeTable);
const exportTableSqlMock = vi.mocked(exportTableSql);
const runScriptMock = vi.mocked(runScript);
const runSqlMock = vi.mocked(runSql);

describe("migrateTables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies same-engine schema and data", async () => {
    exportTableSqlMock.mockResolvedValue("CREATE TABLE users (id INT);");
    runScriptMock.mockResolvedValue(0);
    runSqlMock
      .mockResolvedValueOnce({
        columns: ["id"],
        rows: [[1], [2]],
        rowsAffected: null,
      })
      .mockResolvedValueOnce({ columns: [], rows: [], rowsAffected: 2 });

    const logs: string[] = [];
    const result = await migrateTables(
      {
        sourceId: "s",
        sourceEngine: "postgres",
        targetId: "t",
        targetEngine: "postgres",
        tables: ["public.users"],
        copySchema: true,
        copyData: true,
        dropExisting: false,
        batchSize: 100,
      },
      (l) => logs.push(l),
      () => false,
    );

    expect(exportTableSqlMock).toHaveBeenCalled();
    expect(runScriptMock).toHaveBeenCalled();
    expect(result).toEqual({ tables: 1, rows: 2 });
    expect(logs.some((l) => l.includes("schema created"))).toBe(true);
  });

  it("uses type map DDL across engines and respects cancel", async () => {
    describeTableMock.mockResolvedValue({
      columns: [
        {
          name: "id",
          dataType: "INT",
          nullable: false,
          defaultValue: null,
          isPk: true,
        },
      ],
      foreignKeys: [],
      indexes: [],
    });
    runSqlMock.mockResolvedValue({ columns: [], rows: [], rowsAffected: null });

    let cancel = false;
    const logs: string[] = [];
    await migrateTables(
      {
        sourceId: "s",
        sourceEngine: "mysql",
        targetId: "t",
        targetEngine: "postgres",
        tables: ["users", "orders"],
        copySchema: true,
        copyData: false,
        dropExisting: true,
        batchSize: 50,
      },
      (l) => {
        logs.push(l);
        cancel = true;
      },
      () => cancel,
    );

    expect(runSqlMock).toHaveBeenCalled();
    expect(logs.some((l) => /Cancelled/i.test(l))).toBe(true);
  });
});
