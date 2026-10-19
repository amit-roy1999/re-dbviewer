import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: unknown[]) => invoke(...a),
}));

import { copyText, readText } from "@/lib/clipboard";

describe("clipboard", () => {
  beforeEach(() => {
    invoke.mockReset();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue("from-browser"),
      },
    });
  });

  it("copyText uses Tauri invoke", async () => {
    invoke.mockResolvedValue(undefined);
    await copyText("hi");
    expect(invoke).toHaveBeenCalledWith("write_clipboard", { text: "hi" });
  });

  it("copyText falls back to navigator", async () => {
    invoke.mockRejectedValue(new Error("no tauri"));
    await copyText("hi");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hi");
  });

  it("readText uses Tauri then falls back", async () => {
    invoke.mockResolvedValue("from-tauri");
    expect(await readText()).toBe("from-tauri");
    invoke.mockRejectedValue(new Error("no"));
    expect(await readText()).toBe("from-browser");
  });
});
