/** Human-friendly cell text for result grids, copy, and export. */

const DEBUG_DATE_RE =
  /^Date\("?'(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2}(?:\.\d+)?)?)'?"?\)$/;
const DEBUG_TIME_RE =
  /^Time\("?'(-?\d+:\d{2}:\d{2}(?:\.\d+)?)'?"?\)$/;

/** Strip leftover Rust Debug wrappers from older MySQL serialization. */
export function unwrapDebugTemporal(s: string): string {
  const date = DEBUG_DATE_RE.exec(s);
  if (date) return date[1];
  const time = DEBUG_TIME_RE.exec(s);
  if (time) return time[1];
  return s;
}

/**
 * Format a cell value for display / copy.
 * - null → empty string (callers that want "NULL" handle that separately)
 * - bool / number → plain text
 * - objects / arrays → compact JSON
 * - strings → unwrap Debug Date/Time if present; otherwise as-is
 */
export function formatCellDisplay(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return unwrapDebugTemporal(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Short label for grid cells; truncates very long values. */
export function formatCellPreview(value: unknown, maxLen = 200): string {
  const text = formatCellDisplay(value);
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}
