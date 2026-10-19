import { beforeEach, describe, expect, it, vi } from "vitest";

const once = vi.fn();

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class {
    once = once;
    constructor(_label: string, _opts: unknown) {}
  },
}));

import { openNewWindow } from "@/lib/newWindow";

describe("newWindow", () => {
  beforeEach(() => {
    once.mockReset();
    once.mockImplementation((event: string, cb: (payload?: unknown) => void) => {
      if (event === "tauri://created") cb();
    });
    vi.stubGlobal("open", vi.fn().mockReturnValue(null));
  });

  it("waits for tauri://created on the new window", async () => {
    await openNewWindow();
    expect(once).toHaveBeenCalledWith("tauri://created", expect.any(Function));
    expect(window.open).not.toHaveBeenCalled();
  });

  it("falls back to window.open when window creation errors", async () => {
    once.mockImplementation((event: string, cb: (payload?: unknown) => void) => {
      if (event === "tauri://error") cb({ payload: "fail" });
    });
    await openNewWindow();
    expect(window.open).toHaveBeenCalled();
  });
});
