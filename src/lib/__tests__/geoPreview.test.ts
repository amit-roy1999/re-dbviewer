import { describe, expect, it } from "vitest";
import { classifyGeo } from "@/lib/geoPreview";

describe("classifyGeo", () => {
  it("detects WKT", () => {
    expect(classifyGeo("POINT(1 2)")?.kind).toBe("wkt");
  });

  it("detects GeoJSON string and object", () => {
    expect(
      classifyGeo('{"type":"Point","coordinates":[1,2]}')?.kind,
    ).toBe("geojson");
    const g = classifyGeo({ type: "Point", coordinates: [1, 2] });
    expect(g?.kind).toBe("geojson");
    if (g?.kind === "geojson") expect(g.summary).toBe("Point");
  });

  it("returns null for plain text", () => {
    expect(classifyGeo("hello")).toBeNull();
  });
});
