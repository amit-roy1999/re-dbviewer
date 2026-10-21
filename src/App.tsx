import { useEffect, useRef, useState } from "react";
import { Home as HomeIcon, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import Home from "@/pages/Home";
import Workspace from "@/pages/Workspace";
import { AppMenuBar } from "@/components/AppMenuBar";
import { PreferencesDialog } from "@/components/PreferencesDialog";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import type { SavedConnection } from "@/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  WorkspaceActionsProvider,
  type WorkspaceActions,
} from "@/lib/workspaceActions";
import {
  UI_ZOOM_STEP,
  applyPreferenceEffects,
  bumpUiZoom,
  loadPreferences,
  resetUiZoom,
} from "@/lib/preferences";
import { trackEditFocus } from "@/lib/clipboard";
import { openNewWindow } from "@/lib/newWindow";
import { ToolsHost, type ToolId } from "@/components/tools/ToolsHost";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { installDiagnosticsListeners, logError } from "@/lib/diagnostics";

export default function App() {
  // Multi-connection: every open connection keeps its own mounted Workspace; one is in front.
  const [conns, setConns] = useState<SavedConnection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const open = conns.find((c) => c.id === activeId) ?? null;
  const [actionsById, setActionsById] = useState<
    Record<string, WorkspaceActions | null>
  >({});
  const workspaceActions = activeId ? (actionsById[activeId] ?? null) : null;
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tool, setTool] = useState<ToolId | null>(null);

  function onOpen(conn: SavedConnection) {
    // open_connection already made this the active Rust session
    setConns((prev) =>
      prev.some((c) => c.id === conn.id)
        ? prev.map((c) => (c.id === conn.id ? conn : c))
        : [...prev, conn],
    );
    setActiveId(conn.id);
  }

  async function activate(id: string | null) {
    if (id) {
      try {
        await invoke("set_active_connection", { id });
      } catch {
        logError("set_active_connection failed");
      }
    }
    setActiveId(id);
  }

  async function closeConns(ids: string[], preferActive?: string | null) {
    if (!ids.length) return;
    const doomed = new Set(ids);
    for (const id of ids) {
      try {
        await invoke("close_connection", { connectionId: id });
      } catch {
        // already closed
      }
    }
    let nextActive: string | null = null;
    setConns((prev) => {
      const rest = prev.filter((c) => !doomed.has(c.id));
      if (preferActive != null && rest.some((c) => c.id === preferActive)) {
        nextActive = preferActive;
      } else if (activeId && !doomed.has(activeId)) {
        nextActive = activeId;
      } else {
        nextActive = rest[rest.length - 1]?.id ?? null;
      }
      return rest;
    });
    setActionsById((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    await activate(nextActive);
  }

  async function closeConn(id: string) {
    await closeConns([id]);
  }

  async function closeOtherConns(keepId: string) {
    await closeConns(
      conns.filter((c) => c.id !== keepId).map((c) => c.id),
      keepId,
    );
  }

  async function closeAllConns() {
    await closeConns(conns.map((c) => c.id), null);
  }

  async function disconnect() {
    if (activeId) await closeConn(activeId);
  }

  useEffect(() => {
    applyPreferenceEffects(loadPreferences());
    trackEditFocus();
    return installDiagnosticsListeners();
  }, []);

  // App-level shortcuts: zoom, disconnect, new window, prefs.
  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;
  const connectedRef = useRef(false);
  connectedRef.current = open != null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key;
      const kl = k.toLowerCase();
      // Zoom: Ctrl++ / Ctrl+= / NumpadAdd ; Ctrl+- ; Ctrl+0 reset
      // (on many layouts "+" is Shift+=, so allow shift when key is "+")
      if (
        k === "+" ||
        e.code === "NumpadAdd" ||
        (!e.shiftKey && (k === "=" || e.code === "Equal"))
      ) {
        e.preventDefault();
        bumpUiZoom(UI_ZOOM_STEP);
        return;
      }
      if (
        k === "-" ||
        k === "_" ||
        e.code === "NumpadSubtract" ||
        e.code === "Minus"
      ) {
        e.preventDefault();
        bumpUiZoom(-UI_ZOOM_STEP);
        return;
      }
      if (!e.shiftKey && (k === "0" || e.code === "Digit0" || e.code === "Numpad0")) {
        e.preventDefault();
        resetUiZoom();
        return;
      }
      if (e.shiftKey && kl === "q") {
        e.preventDefault();
        if (connectedRef.current) void disconnectRef.current();
      } else if (e.shiftKey && kl === "n") {
        e.preventDefault();
        void openNewWindow();
      } else if (!e.shiftKey && kl === ",") {
        e.preventDefault();
        setPrefsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <TooltipProvider>
      <WorkspaceActionsProvider value={open ? workspaceActions : null}>
      <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <AppMenuBar
          connected={open != null}
          onDisconnect={() => void disconnect()}
          onNewWindow={() => void openNewWindow()}
          onPreferences={() => setPrefsOpen(true)}
          onShortcuts={() => setShortcutsOpen(true)}
          onTool={setTool}
        />
        {conns.length > 0 ? (
          <div className="flex h-8 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border bg-muted/30 px-2">
            <button
              type="button"
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-t-md px-2.5 text-xs",
                activeId === null
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => void activate(null)}
            >
              <HomeIcon className="size-3.5" />
              Connections
            </button>
            {conns.map((c) => (
              <ContextMenu key={c.id}>
                <ContextMenuTrigger asChild>
                  <div
                    className={cn(
                      "group flex h-7 items-center gap-1.5 rounded-t-md border-t-2 border-l-[3px] px-2.5 text-xs",
                      activeId === c.id
                        ? "bg-background text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    style={{
                      // B6: the connection colour is always visible as a left stripe.
                      borderLeftColor: c.accentColor || "#2563eb",
                      borderTopColor:
                        activeId === c.id
                          ? c.accentColor || "#2563eb"
                          : "transparent",
                    }}
                  >
                    <button
                      type="button"
                      className="max-w-40 truncate"
                      onClick={() => void activate(c.id)}
                    >
                      {c.name}
                    </button>
                    <button
                      type="button"
                      title="Disconnect"
                      className="rounded-sm p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
                      onClick={() => void closeConn(c.id)}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-44">
                  <ContextMenuItem onSelect={() => void closeConn(c.id)}>
                    Close
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={conns.length <= 1}
                    onSelect={() => void closeOtherConns(c.id)}
                  >
                    Close others
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => void closeAllConns()}>
                    Close all
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        ) : null}
        <div className="relative min-h-0 flex-1">
          {conns.map((c) => (
            <div
              key={c.id}
              className={cn("h-full", activeId === c.id ? "block" : "hidden")}
            >
              <Workspace
                connection={c}
                visible={activeId === c.id}
                onBack={() => void closeConn(c.id)}
                onActionsReady={(a) =>
                  setActionsById((prev) => ({ ...prev, [c.id]: a }))
                }
                onOpenTool={setTool}
              />
            </div>
          ))}
          {activeId === null ? <Home onOpen={onOpen} /> : null}
        </div>
      </div>
      <ToolsHost
        connection={open}
        tool={tool}
        onClose={() => setTool(null)}
      />
      <PreferencesDialog open={prefsOpen} onClose={() => setPrefsOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </WorkspaceActionsProvider>
    </TooltipProvider>
  );
}
