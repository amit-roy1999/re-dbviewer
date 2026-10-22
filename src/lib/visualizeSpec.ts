/** Build Vega-Lite specs from result rows + user encodings. */

export type ChartMark =
  | "bar"
  | "line"
  | "area"
  | "point"
  | "arc"
  | "rect"
  | "table";

export type ChartEncoding = {
  x: string | null;
  y: string | null;
  color: string | null;
  size: string | null;
};

export type ChartConfig = {
  mark: ChartMark;
  encoding: ChartEncoding;
};

export const CHART_MARKS: { id: ChartMark; label: string }[] = [
  { id: "bar", label: "Bar" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "point", label: "Scatter" },
  { id: "arc", label: "Pie" },
  { id: "rect", label: "Heatmap" },
  { id: "table", label: "Table" },
];

/** Short guidance shown on the Chart step for each mark. */
export const CHART_HELP: Record<ChartMark, string> = {
  bar: "X = category/label (region, category, status). Y = number (amount, units).",
  line: "X = date/time (order_date). Y = number (amount).",
  area: "X = date/time (order_date). Y = number (amount). Optional Color = segment.",
  point: "X and Y = numbers (units vs amount). Optional Color / Size = another field.",
  arc: "Color = category/label (region, segment). Y = number to sum (amount), or leave for counts.",
  rect: "X and Y = categories (region × category). Color = number (amount) or leave blank for counts.",
  table: "No field mapping — shows the result grid as-is.",
};

export type FieldType = "quantitative" | "nominal" | "temporal" | "ordinal";

export function inferFieldType(
  rows: Record<string, unknown>[],
  field: string,
): FieldType {
  for (const row of rows.slice(0, 40)) {
    const v = row[field];
    if (v == null || v === "") continue;
    if (typeof v === "number") return "quantitative";
    if (typeof v === "boolean") return "nominal";
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{4}\/\d{2}\/\d{2}/.test(s))
      return "temporal";
    if (s !== "" && !Number.isNaN(Number(s)) && /^-?\d+(\.\d+)?$/.test(s.trim()))
      return "quantitative";
    return "nominal";
  }
  return "nominal";
}

export function rowsFromResult(
  columns: string[],
  rows: unknown[][],
): Record<string, unknown>[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      o[columns[i] ?? `c${i}`] = r[i];
    }
    return o;
  });
}

/**
 * Vega treats `.` as nested access; escape so flat keys like `orders.total` work.
 * @see https://vega.github.io/vega-lite/docs/field.html
 */
export function escapeVegaField(field: string): string {
  return field.replace(/\\/g, "\\\\").replace(/\./g, "\\.");
}

function encField(
  field: string,
  rows: Record<string, unknown>[],
  opts?: { aggregate?: string },
) {
  const type = inferFieldType(rows, field);
  const e: Record<string, unknown> = {
    field: escapeVegaField(field),
    type,
    title: field,
  };
  if (opts?.aggregate) e.aggregate = opts.aggregate;
  return e;
}

/** Vega-Lite v5 spec; returns null for table mark (render as grid instead). */
export function buildVegaLiteSpec(
  config: ChartConfig,
  values: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (config.mark === "table") return null;
  const { x, y, color, size } = config.encoding;
  const mark = config.mark;

  const encoding: Record<string, unknown> = {};

  if (mark === "arc") {
    const colorField = color || x;
    const valueField = y;
    if (colorField) encoding.color = encField(colorField, values);
    if (valueField && inferFieldType(values, valueField) === "quantitative") {
      encoding.theta = encField(valueField, values, { aggregate: "sum" });
    } else {
      encoding.theta = { aggregate: "count" };
    }
  } else if (mark === "rect") {
    if (x) encoding.x = encField(x, values);
    if (y) encoding.y = encField(y, values);
    if (color) {
      encoding.color = encField(color, values, {
        aggregate:
          inferFieldType(values, color) === "quantitative" ? "mean" : "count",
      });
    } else {
      encoding.color = { aggregate: "count" };
    }
  } else {
    if (x) encoding.x = encField(x, values);
    if (y) {
      const yt = inferFieldType(values, y);
      encoding.y =
        yt === "quantitative"
          ? encField(y, values)
          : { ...encField(y, values), aggregate: "count" };
    }
    if (color) encoding.color = encField(color, values);
    if (size && mark === "point") encoding.size = encField(size, values);
  }

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "re-dbviewer Visualize Data",
    // width/height set by the host when embedding so the chart fills the pane
    data: { values },
    mark: mark === "point" ? { type: "point", filled: true } : mark,
    encoding,
    config: vegaThemeConfig(),
  };
}

function cssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

/** Vega config aligned with app light/dark CSS tokens (teal steel + slate). */
export function vegaThemeConfig(): Record<string, unknown> {
  const dark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const fg = cssColor("--foreground", dark ? "#e8eef3" : "#1a2332");
  const muted = cssColor("--muted-foreground", dark ? "#94a3b8" : "#5b6b7c");
  const border = cssColor("--border", dark ? "#2a3441" : "#d0d7e0");
  const accent = cssColor("--chart-1", dark ? "#2dd4bf" : "#0f766e");
  const chart2 = cssColor("--chart-2", dark ? "#94a3b8" : "#5b6b7c");
  const chart3 = cssColor("--chart-3", dark ? "#64748b" : "#334155");
  const chart4 = cssColor("--chart-4", dark ? "#5eead4" : "#14b8a6");
  const chart5 = cssColor("--chart-5", dark ? "#fbbf24" : "#0ea5e9");
  const grid = dark ? "rgba(148, 163, 184, 0.22)" : "rgba(91, 107, 124, 0.28)";

  return {
    background: "transparent",
    view: { stroke: null },
    axis: {
      labelColor: muted,
      titleColor: fg,
      domainColor: border,
      tickColor: border,
      gridColor: grid,
      gridOpacity: 1,
      labelFontSize: 11,
      titleFontSize: 12,
      titleFontWeight: 500,
    },
    legend: {
      labelColor: muted,
      titleColor: fg,
      labelFontSize: 11,
      titleFontSize: 12,
    },
    range: {
      category: [accent, chart4, chart5, chart2, chart3],
      heatmap: dark
        ? ["#134e4a", "#0f766e", "#14b8a6", "#5eead4", "#ccfbf1"]
        : ["#ccfbf1", "#5eead4", "#14b8a6", "#0f766e", "#134e4a"],
    },
    style: {
      "guide-label": { fill: muted },
      "guide-title": { fill: fg },
    },
    bar: { color: accent },
    line: { color: accent, strokeWidth: 2.5 },
    area: { color: accent, opacity: 0.55 },
    point: { color: accent, filled: true },
    arc: { stroke: dark ? "#171d25" : "#ffffff", strokeWidth: 1 },
    rect: { color: accent },
    text: { color: fg },
  };
}

export function defaultEncoding(columns: string[]): ChartEncoding {
  return {
    x: columns[0] ?? null,
    y: columns[1] ?? columns[0] ?? null,
    color: null,
    size: null,
  };
}
