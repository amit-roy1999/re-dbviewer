import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

/** Local diagnostics helpers. Never pass SQL, passwords, host, or usernames. */

function scrub(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 400);
}

export function logError(message: string): void {
  const safe = scrub(message);
  if (import.meta.env.DEV) console.error(safe);
  void invoke("append_log", { level: "error", message: safe }).catch(() => {});
}

export function logWarn(message: string): void {
  const safe = scrub(message);
  if (import.meta.env.DEV) console.warn(safe);
  void invoke("append_log", { level: "warn", message: safe }).catch(() => {});
}

/** Save a privacy-safe diagnostics text file via the system Save dialog. */
export async function exportDiagnostics(): Promise<boolean> {
  const path = await save({
    defaultPath: "re-dbviewer-diagnostics.txt",
    filters: [{ name: "Text", extensions: ["txt"] }],
  });
  if (!path) return false;
  const contents = await invoke<string>("read_diagnostics");
  await invoke("write_text_file", { path, contents });
  return true;
}

/** Capture uncaught window errors into the local log (once per App mount). */
export function installDiagnosticsListeners(): () => void {
  const onErr = (ev: ErrorEvent) => {
    logError(`uncaught: ${ev.message}`);
  };
  const onRej = (ev: PromiseRejectionEvent) => {
    logError(`unhandledrejection: ${String(ev.reason)}`);
  };
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onRej);
  return () => {
    window.removeEventListener("error", onErr);
    window.removeEventListener("unhandledrejection", onRej);
  };
}
