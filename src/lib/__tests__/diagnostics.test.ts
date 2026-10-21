import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const save = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: unknown[]) => invoke(...a),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (...a: unknown[]) => save(...a),
}));

import {
  exportDiagnostics,
  installDiagnosticsListeners,
  logError,
  logWarn,
} from "@/lib/diagnostics";

describe("diagnostics", () => {
  beforeEach(() => {
    invoke.mockReset();
    save.mockReset();
    invoke.mockResolvedValue(undefined);
  });

  it("logError scrubs and appends", () => {
    logError("  hello\n\nworld  ");
    expect(invoke).toHaveBeenCalledWith("append_log", {
      level: "error",
      message: "hello world",
    });
  });

  it("logWarn truncates long messages", () => {
    logWarn("x".repeat(500));
    const msg = (invoke.mock.calls[0][1] as { message: string }).message;
    expect(msg.length).toBe(400);
  });

  it("exportDiagnostics cancels when no path", async () => {
    save.mockResolvedValue(null);
    expect(await exportDiagnostics()).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("exportDiagnostics writes file", async () => {
    save.mockResolvedValue("/tmp/d.txt");
    invoke
      .mockResolvedValueOnce("diag body")
      .mockResolvedValueOnce(undefined);
    expect(await exportDiagnostics()).toBe(true);
    expect(invoke).toHaveBeenCalledWith("read_diagnostics");
    expect(invoke).toHaveBeenCalledWith("write_text_file", {
      path: "/tmp/d.txt",
      contents: "diag body",
    });
  });

  it("installDiagnosticsListeners wires and cleans up", () => {
    const add = vi.spyOn(window, "addEventListener");
    const rem = vi.spyOn(window, "removeEventListener");
    const stop = installDiagnosticsListeners();
    expect(add).toHaveBeenCalledWith("error", expect.any(Function));
    expect(add).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function),
    );
    stop();
    expect(rem).toHaveBeenCalledWith("error", expect.any(Function));
    add.mockRestore();
    rem.mockRestore();
  });
});
