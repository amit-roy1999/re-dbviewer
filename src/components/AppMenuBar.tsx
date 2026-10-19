import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toggleTheme } from "@/lib/theme";
import {
  editCopy,
  editCut,
  editPaste,
  editRedo,
  editUndo,
} from "@/lib/clipboard";
import {
  UI_ZOOM_STEP,
  bumpUiZoom,
  resetUiZoom,
} from "@/lib/preferences";
import { useWorkspaceActions } from "@/lib/workspaceActions";
import { cn } from "@/lib/utils";
import type { ToolId } from "@/components/tools/ToolsHost";

type Props = {
  connected: boolean;
  onDisconnect: () => void;
  onNewWindow: () => void;
  onPreferences: () => void;
  onShortcuts?: () => void;
  /** Open an admin / modeling tool dialog for the front connection. */
  onTool?: (tool: ToolId) => void;
};

const menuBtn =
  "h-7 rounded-sm px-2.5 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground";

export function AppMenuBar({
  connected,
  onDisconnect,
  onNewWindow,
  onPreferences,
  onShortcuts,
  onTool,
}: Props) {
  const actions = useWorkspaceActions();
  const ws = connected && actions != null;
  async function exitApp() {
    const win = getCurrentWindow();
    try {
      await win.destroy();
    } catch {
      try {
        await win.close();
      } catch {
        // last resort in non-tauri preview
        window.close();
      }
    }
  }

  return (
    <header className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border bg-card px-2">
      <span
        className="mr-1 inline-flex size-5 items-center justify-center rounded-sm bg-primary text-[10px] font-bold text-primary-foreground"
        aria-hidden
      >
        re
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger className={cn(menuBtn)}>File</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-52">
          <DropdownMenuItem onSelect={onNewWindow}>
            New Window
            <DropdownMenuShortcut>Ctrl+Shift+N</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.newQueryTab()}
          >
            New Query Tab
            <DropdownMenuShortcut>Ctrl+T</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.closeActiveTab()}
          >
            Close Tab
            <DropdownMenuShortcut>Ctrl+W</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.openSqlFile()}
          >
            Open SQL…
            <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.saveSqlFile()}
          >
            Save
            <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.saveSqlFileAs()}
          >
            Save As…
            <DropdownMenuShortcut>Ctrl+Shift+S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.exportQueryCsv()}
          >
            Export Result CSV…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.dumpSchema()}
          >
            Dump Schema SQL…
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.dumpTables()}
          >
            Dump Selected Tables…
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.restoreSql()}
          >
            Restore SQL File…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onPreferences}>
            Preferences…
            <DropdownMenuShortcut>Ctrl+,</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.reconnect()}
          >
            Reconnect
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!connected}
            onClick={() => {
              if (connected) onDisconnect();
            }}
          >
            Disconnect
            <DropdownMenuShortcut>Ctrl+Shift+Q</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void exitApp();
            }}
          >
            Exit
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className={cn(menuBtn)}>Edit</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-44"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.formatSql()}
          >
            Format SQL
            <DropdownMenuShortcut>Ctrl+Shift+F</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!ws} onSelect={editUndo}>
            Undo
            <DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!ws} onSelect={editRedo}>
            Redo
            <DropdownMenuShortcut>Ctrl+Y</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void editCut()}>
            Cut
            <DropdownMenuShortcut>Ctrl+X</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void editCopy()}>
            Copy
            <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void editPaste()}>
            Paste
            <DropdownMenuShortcut>Ctrl+V</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className={cn(menuBtn)}>Query</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.runScript()}
          >
            Run Script (all statements)
            <DropdownMenuShortcut>Ctrl+Shift+Enter</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.stopQuery()}
          >
            Stop
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.beginTx()}
          >
            Begin Transaction
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.commitTx()}
          >
            Commit
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.rollbackTx()}
          >
            Rollback
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className={cn(menuBtn)}>View</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.toggleHistory()}
          >
            Toggle History
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.toggleSnippets()}
          >
            Toggle Snippets
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.toggleHelp()}
          >
            Toggle Context Help
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.globalSearch()}
          >
            Search Data…
            <DropdownMenuShortcut>Ctrl+Shift+H</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.inspectTable()}
          >
            Inspect Table…
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.schemaInspector()}
          >
            Schema Inspector…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              bumpUiZoom(UI_ZOOM_STEP);
            }}
          >
            Zoom in
            <DropdownMenuShortcut>Ctrl++</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              bumpUiZoom(-UI_ZOOM_STEP);
            }}
          >
            Zoom out
            <DropdownMenuShortcut>Ctrl+-</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              resetUiZoom();
            }}
          >
            Reset zoom
            <DropdownMenuShortcut>Ctrl+0</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onPreferences}>
            Preferences…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onShortcuts?.()}>
            Keyboard shortcuts…
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              toggleTheme();
            }}
          >
            Toggle theme
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className={cn(menuBtn)}>Tools</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuItem
            disabled={!ws}
            onSelect={() => actions?.openServerAdmin()}
          >
            Server Admin (Workbench Administration)…
          </DropdownMenuItem>
          {(
            [
              ["eer", "EER Diagram / Forward Engineer…"],
              ["compare", "Schema Compare…"],
              ["migrate", "Migration Wizard…"],
            ] as const
          ).map(([id, label]) => (
            <DropdownMenuItem
              key={id}
              disabled={!connected}
              onSelect={() => onTool?.(id)}
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
