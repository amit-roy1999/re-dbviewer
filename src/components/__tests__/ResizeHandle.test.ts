import { describe, expect, it } from "vitest";
import { clamp } from "@/components/ResizeHandle";

describe("clamp", () => {
  it("clamps to inclusive range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});
