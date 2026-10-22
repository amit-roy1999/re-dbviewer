import { describe, expect, it } from "vitest";
import {
  buildVegaLiteSpec,
  CHART_HELP,
  defaultEncoding,
  escapeVegaField,
  inferFieldType,
  rowsFromResult,
  vegaThemeConfig,
} from "@/lib/visualizeSpec";

describe("visualizeSpec", () => {
  it("rowsFromResult maps columns to objects", () => {
    expect(rowsFromResult(["a", "b"], [[1, "x"], [2, "y"]])).toEqual([
      { a: 1, b: "x" },
      { a: 2, b: "y" },
    ]);
  });

  it("inferFieldType distinguishes quantitative, temporal, nominal", () => {
    expect(inferFieldType([{ n: 3 }], "n")).toBe("quantitative");
    expect(inferFieldType([{ n: "12.5" }], "n")).toBe("quantitative");
    expect(inferFieldType([{ d: "2024-01-15" }], "d")).toBe("temporal");
    expect(inferFieldType([{ s: "alice" }], "s")).toBe("nominal");
  });

  it("defaultEncoding picks first two columns", () => {
    expect(defaultEncoding(["name", "id", "age"])).toEqual({
      x: "name",
      y: "id",
      color: null,
      size: null,
    });
    expect(defaultEncoding([])).toEqual({
      x: null,
      y: null,
      color: null,
      size: null,
    });
  });

  it("buildVegaLiteSpec returns null for table mark", () => {
    expect(
      buildVegaLiteSpec(
        { mark: "table", encoding: { x: null, y: null, color: null, size: null } },
        [],
      ),
    ).toBeNull();
  });

  it("buildVegaLiteSpec builds bar with x/y encodings", () => {
    const values = [
      { name: "a", n: 1 },
      { name: "b", n: 2 },
    ];
    const spec = buildVegaLiteSpec(
      {
        mark: "bar",
        encoding: { x: "name", y: "n", color: null, size: null },
      },
      values,
    );
    expect(spec).toMatchObject({
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      mark: "bar",
      data: { values },
    });
    expect(spec?.encoding).toMatchObject({
      x: { field: "name", type: "nominal" },
      y: { field: "n", type: "quantitative" },
    });
  });

  it("CHART_HELP describes encodings", () => {
    expect(CHART_HELP.bar).toMatch(/X =/i);
  });

  it("buildVegaLiteSpec pie uses theta aggregate", () => {
    const values = [{ cat: "a", n: 3 }];
    const spec = buildVegaLiteSpec(
      {
        mark: "arc",
        encoding: { x: "cat", y: "n", color: null, size: null },
      },
      values,
    );
    expect(spec?.mark).toBe("arc");
    expect(spec?.encoding).toMatchObject({
      color: { field: "cat" },
      theta: { field: "n", aggregate: "sum" },
    });
  });

  it("vegaThemeConfig uses transparent background and accent marks", () => {
    const cfg = vegaThemeConfig();
    expect(cfg.background).toBe("transparent");
    expect(cfg.line).toMatchObject({ strokeWidth: 2.5 });
    expect(cfg.axis).toBeTruthy();
  });

  it("escapes dots in table.column fields for Vega", () => {
    expect(escapeVegaField("order_items.amount")).toBe("order_items\\.amount");
    const values = [
      { "categories.name": "Laptops", "order_items.amount": 100 },
      { "categories.name": "Phones", "order_items.amount": 50 },
    ];
    const spec = buildVegaLiteSpec(
      {
        mark: "bar",
        encoding: {
          x: "categories.name",
          y: "order_items.amount",
          color: null,
          size: null,
        },
      },
      values,
    );
    expect(spec?.encoding).toMatchObject({
      x: { field: "categories\\.name", title: "categories.name" },
      y: { field: "order_items\\.amount", title: "order_items.amount" },
    });
  });

  it("buildVegaLiteSpec scatter uses size encoding when set", () => {
    const values = [{ x: 1, y: 2, s: 10 }];
    const spec = buildVegaLiteSpec(
      {
        mark: "point",
        encoding: { x: "x", y: "y", color: null, size: "s" },
      },
      values,
    );
    expect(spec?.mark).toMatchObject({ type: "point", filled: true });
    expect(spec?.encoding).toMatchObject({
      size: { field: "s" },
    });
  });

  it("buildVegaLiteSpec heatmap uses rect mark", () => {
    const values = [{ a: "x", b: "y", n: 3 }];
    const spec = buildVegaLiteSpec(
      {
        mark: "rect",
        encoding: { x: "a", y: "b", color: "n", size: null },
      },
      values,
    );
    expect(spec?.mark).toBe("rect");
    expect(spec?.encoding).toMatchObject({
      color: { field: "n" },
    });
  });
});
