/** Detect WKT / GeoJSON cell values for spatial preview. */

export type GeoPreview =
  | { kind: "wkt"; text: string }
  | { kind: "geojson"; text: string; summary: string }
  | null;

export function classifyGeo(value: unknown): GeoPreview {
  if (value == null) return null;
  if (typeof value === "object") {
    const o = value as { type?: string; coordinates?: unknown };
    if (o.type && Array.isArray(o.coordinates)) {
      return {
        kind: "geojson",
        text: JSON.stringify(value, null, 2),
        summary: `${o.type}`,
      };
    }
  }
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (
    /^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\s*\(/i.test(
      t,
    )
  ) {
    return { kind: "wkt", text: t.length > 4000 ? `${t.slice(0, 4000)}…` : t };
  }
  if (t.startsWith("{") && /"type"\s*:/.test(t) && /coordinates/i.test(t)) {
    try {
      const o = JSON.parse(t) as { type?: string };
      return {
        kind: "geojson",
        text: JSON.stringify(JSON.parse(t), null, 2).slice(0, 8000),
        summary: o.type ?? "GeoJSON",
      };
    } catch {
      return null;
    }
  }
  return null;
}
