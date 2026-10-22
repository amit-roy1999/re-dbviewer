import { describe, expect, it } from "vitest";
import {
  formatCellDisplay,
  formatCellPreview,
  unwrapDebugTemporal,
} from "@/lib/cellFormat";

describe("unwrapDebugTemporal", () => {
  it("strips MySQL Rust Debug Date wrappers", () => {
    expect(unwrapDebugTemporal(`Date("'2026-10-17 11:56:35'")`)).toBe(
      "2026-10-17 11:56:35",
    );
    expect(unwrapDebugTemporal(`Date("'2026-10-17'")`)).toBe("2026-10-17");
  });

  it("strips Time wrappers", () => {
    expect(unwrapDebugTemporal(`Time("'03:02:01'")`)).toBe("03:02:01");
    expect(unwrapDebugTemporal(`Time("'-27:00:00'")`)).toBe("-27:00:00");
  });

  it("leaves normal strings alone", () => {
    expect(unwrapDebugTemporal("2026-10-17 11:56:35")).toBe(
      "2026-10-17 11:56:35",
    );
    expect(unwrapDebugTemporal("hello")).toBe("hello");
  });
});

describe("formatCellDisplay", () => {
  it("formats primitives cleanly", () => {
    expect(formatCellDisplay(null)).toBe("");
    expect(formatCellDisplay(true)).toBe("true");
    expect(formatCellDisplay(false)).toBe("false");
    expect(formatCellDisplay(42)).toBe("42");
    expect(formatCellDisplay("plain")).toBe("plain");
  });

  it("unwraps Debug dates in strings", () => {
    expect(formatCellDisplay(`Date("'2026-10-17 11:56:35'")`)).toBe(
      "2026-10-17 11:56:35",
    );
  });

  it("stringifies objects as compact JSON", () => {
    expect(formatCellDisplay({ a: 1 })).toBe('{"a":1}');
    expect(formatCellDisplay([1, 2])).toBe("[1,2]");
  });
});

describe("formatCellPreview", () => {
  it("truncates long values", () => {
    const long = "x".repeat(250);
    expect(formatCellPreview(long, 200)).toBe(`${"x".repeat(200)}…`);
  });
});
