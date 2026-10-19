import type { SavedConnection } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminPanel } from "@/components/tools/AdminPanel";
import { EerDiagram } from "@/components/tools/EerDiagram";
import { SchemaCompare } from "@/components/tools/SchemaCompare";
import { MigrationWizard } from "@/components/tools/MigrationWizard";

export type ToolId = "admin" | "eer" | "compare" | "migrate";

const TITLES: Record<ToolId, string> = {
  admin: "Server Admin",
  eer: "EER Diagram",
  compare: "Schema Compare",
  migrate: "Migration Wizard",
};

/** Full-size dialog hosting the admin/modeling tools; they act on the front connection. */
export function ToolsHost({
  connection,
  tool,
  onClose,
}: {
  connection: SavedConnection | null;
  tool: ToolId | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={tool != null && connection != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[88vh] flex-col sm:max-w-[min(1200px,94vw)]">
        <DialogHeader>
          <DialogTitle>
            {tool ? TITLES[tool] : ""}
            {connection ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {connection.name} ({connection.engine})
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          {connection && tool === "admin" ? <AdminPanel connection={connection} /> : null}
          {connection && tool === "eer" ? (
            <EerDiagram connection={connection} onClose={onClose} />
          ) : null}
          {connection && tool === "compare" ? <SchemaCompare connection={connection} /> : null}
          {connection && tool === "migrate" ? <MigrationWizard connection={connection} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
