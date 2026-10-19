import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

/**
 * Open another app window (Home screen). Falls back to a browser tab outside Tauri.
 * Note: the Rust side holds ONE live DB session shared by all windows.
 */
export async function openNewWindow(): Promise<void> {
  const label = `win-${Date.now().toString(36)}`;
  try {
    const win = new WebviewWindow(label, {
      url: "index.html",
      title: "re-dbviewer",
      width: 1100,
      height: 720,
    });
    await new Promise<void>((resolve, reject) => {
      void win.once("tauri://created", () => resolve());
      void win.once("tauri://error", (e) => reject(new Error(String(e.payload))));
    });
  } catch {
    window.open(window.location.href, "_blank");
  }
}
