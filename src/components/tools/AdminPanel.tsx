import type { SavedConnection } from "@/types";
import { DEFAULT_ADMIN_VIEW } from "@/lib/adminNav";
import { AdminWorkbench } from "@/components/admin/AdminWorkbench";
import { useWorkspaceActions } from "@/lib/workspaceActions";

/** Legacy Tools dialog host — prefers in-workspace Administration when available. */
export function AdminPanel({ connection }: { connection: SavedConnection }) {
  const actions = useWorkspaceActions();

  return (
    <div className="flex h-[70vh] min-h-0 flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Tip: click the connection name in the sidebar to open the full Workbench-style
        Administration view.{" "}
        {actions ? (
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => actions.openServerAdmin()}
          >
            Open Administration
          </button>
        ) : null}
      </p>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
        <AdminWorkbench
          connection={connection}
          view={DEFAULT_ADMIN_VIEW}
          actions={{
            dumpSchema: (includeData) => actions?.dumpSchema(includeData),
            dumpTables: () => actions?.dumpTables(),
            restoreSql: () => actions?.restoreSql(),
          }}
        />
      </div>
    </div>
  );
}
