import { describe, expect, it } from "vitest";
import {
  bytesToHexDump,
  bytesToImageDataUrl,
  classifyCellPreview,
} from "@/lib/cellPreview";

describe("cellPreview", () => {
  it("classifies PNG bytes as image", () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(classifyCellPreview(png)).toBe("image");
    expect(bytesToImageDataUrl(png)?.startsWith("data:image/png;base64,")).toBe(
      true,
    );
  });

  it("hex-dumps arbitrary binary", () => {
    const bytes = Uint8Array.from([0x00, 0x01, 0x41, 0xff]);
    expect(classifyCellPreview(bytes)).toBe("hex");
    const dump = bytesToHexDump(bytes)!;
    expect(dump).toMatch(/0000/);
    expect(dump).toMatch(/41/);
  });

  it("ignores plain text", () => {
    expect(classifyCellPreview("hello")).toBeNull();
  });
});
