import { describe, expect, it } from "vitest";
import { queryResultFromXlsx, resultToXlsxBuffer } from "@/lib/excelExport";

describe("excelExport", () => {
  it("round-trips query result through xlsx", () => {
    const buf = resultToXlsxBuffer({
      columns: ["id", "name"],
      rows: [
        [1, "Ada"],
        [2, "Grace"],
      ],
      rowsAffected: null,
    });
    expect(buf.byteLength).toBeGreaterThan(100);
    const back = queryResultFromXlsx(buf);
    expect(back.columns).toEqual(["id", "name"]);
    expect(back.rows).toHaveLength(2);
    expect(String(back.rows[0][1])).toBe("Ada");
  });
});
