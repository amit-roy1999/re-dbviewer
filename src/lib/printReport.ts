import type { QueryResult } from "@/types";
import { resultToHtml } from "@/lib/resultExport";

/** Open a printable HTML report for a result set (browser print → PDF). */
export function openPrintReport(
  title: string,
  result: QueryResult,
): void {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body{font:12px/1.4 system-ui,sans-serif;margin:24px;color:#111}
  h1{font-size:16px;margin:0 0 12px}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}
  th{background:#f3f3f3}
  @media print{body{margin:0}}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
${resultToHtml(result)}
<script>window.onload=()=>window.print()</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) throw new Error("Popup blocked — allow popups to print");
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
