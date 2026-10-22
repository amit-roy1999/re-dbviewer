import { useEffect, useState } from "react";
import {
  type AppPreferences,
  DEFAULT_PREFS,
  UI_ZOOM_MAX,
  UI_ZOOM_MIN,
  clampUiZoom,
  loadPreferences,
  savePreferences,
} from "@/lib/preferences";
import { exportDiagnostics, logError } from "@/lib/diagnostics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: (prefs: AppPreferences) => void;
};

export function PreferencesDialog({ open, onClose, onSaved }: Props) {
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFS);
  const [exportStatus, setExportStatus] = useState("");

  useEffect(() => {
    if (open) {
      setPrefs(loadPreferences());
      setExportStatus("");
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg"
        role="dialog"
        aria-label="Preferences"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="text-sm font-semibold">Preferences</h2>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="space-y-3 px-4 py-3 text-xs">
          <label className="flex items-center justify-between gap-3">
            <span>App zoom (%)</span>
            <Input
              type="number"
              className="h-7 w-20"
              min={UI_ZOOM_MIN}
              max={UI_ZOOM_MAX}
              step={10}
              value={prefs.uiZoom ?? 100}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  uiZoom: clampUiZoom(Number(e.target.value) || 100),
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Editor font size</span>
            <Input
              type="number"
              className="h-7 w-20"
              min={10}
              max={24}
              value={prefs.editorFontSize}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  editorFontSize: Number(e.target.value) || 13,
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Tab size</span>
            <Input
              type="number"
              className="h-7 w-20"
              min={1}
              max={8}
              value={prefs.editorTabSize}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  editorTabSize: Number(e.target.value) || 2,
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Default LIMIT</span>
            <Input
              type="number"
              className="h-7 w-20"
              min={1}
              max={10000}
              value={prefs.defaultLimit}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  defaultLimit: Number(e.target.value) || 100,
                }))
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.editorSoftWrap}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, editorSoftWrap: e.target.checked }))
              }
            />
            Soft wrap
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.confirmDestructive}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  confirmDestructive: e.target.checked,
                }))
              }
            />
            Confirm DELETE / DROP / TRUNCATE
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.highContrast}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, highContrast: e.target.checked }))
              }
            />
            High contrast
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!prefs.aiAssistLocal}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, aiAssistLocal: e.target.checked }))
              }
            />
            Local AI SQL assist (templates only, no network)
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Backup reminder (hours, 0=off)</span>
            <Input
              type="number"
              className="h-7 w-20"
              min={0}
              max={720}
              value={prefs.backupIntervalHours ?? 0}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  backupIntervalHours: Math.max(
                    0,
                    Number(e.target.value) || 0,
                  ),
                }))
              }
            />
          </label>
          <div className="border-t border-border pt-3">
            <div className="mb-1 font-medium text-foreground">Diagnostics</div>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Local error log only — no network upload. Export omits passwords,
              SQL, hostnames, and usernames.
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      const ok = await exportDiagnostics();
                      setExportStatus(ok ? "Saved." : "Cancelled.");
                    } catch {
                      setExportStatus("Export failed.");
                      logError("export_diagnostics failed");
                    }
                  })();
                }}
              >
                Export diagnostics…
              </Button>
              {exportStatus ? (
                <span className="text-[11px] text-muted-foreground">
                  {exportStatus}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              savePreferences(prefs);
              onSaved?.(prefs);
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
