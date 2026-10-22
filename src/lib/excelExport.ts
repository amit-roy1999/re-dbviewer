import * as XLSX from "xlsx";
import type { QueryResult } from "@/types";
import { formatCellDisplay } from "@/lib/cellFormat";

/** Build an .xlsx ArrayBuffer from a query result (SheetJS). */
export function resultToXlsxBuffer(result: QueryResult, sheetName = "Sheet1"): ArrayBuffer {
  const rows = result.rows.map((row) => {
    const o: Record<string, unknown> = {};
    result.columns.forEach((c, i) => {
      const v = row[i];
      if (v === null || v === undefined) {
        o[c] = "";
      } else if (typeof v === "number" || typeof v === "boolean") {
        o[c] = v;
      } else {
        o[c] = formatCellDisplay(v);
      }
    });
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(rows, { header: result.columns });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Sheet1");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

/** Parse first sheet of an .xlsx / .xls ArrayBuffer into a QueryResult. */
export function queryResultFromXlsx(buf: ArrayBuffer): QueryResult {
  const wb = XLSX.read(buf, { type: "array" });
  const name = wb.SheetNames[0];
  if (!name) return { columns: [], rows: [], rowsAffected: null };
  const sheet = wb.Sheets[name];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });
  if (!json.length) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const header = (aoa[0] as unknown[] | undefined)?.map(String) ?? [];
    return { columns: header, rows: [], rowsAffected: null };
  }
  const columns = Object.keys(json[0]);
  const rows = json.map((obj) => columns.map((c) => obj[c] ?? null));
  return { columns, rows, rowsAffected: null };
}
