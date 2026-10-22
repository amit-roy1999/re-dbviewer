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
import { FakeDataFactory } from "@/components/tools/FakeDataFactory";
import { VisualizeData } from "@/components/tools/VisualizeData";
import { VisualQueryBuilder } from "@/components/tools/VisualQueryBuilder";
import { DataCompare } from "@/components/tools/DataCompare";
import { SchemaDataSync } from "@/components/tools/SchemaDataSync";
import { PivotTool } from "@/components/tools/PivotTool";
import { QueryNotebook } from "@/components/tools/QueryNotebook";

export type ToolId =
  | "admin"
  | "eer"
  | "compare"
  | "dataCompare"
  | "schemaSync"
  | "migrate"
  | "fakeData"
  | "visualize"
  | "vqb"
  | "pivot"
  | "notebook";

const TITLES: Record<ToolId, string> = {
  admin: "Server Admin",
  eer: "EER Diagram",
  compare: "Schema Compare",
  dataCompare: "Data Compare",
  schemaSync: "Schema Sync",
  migrate: "Migration Wizard",
  fakeData: "Fake Data Factory",
  visualize: "Visualize Data",
  vqb: "Visual Query Builder",
  pivot: "Pivot / Crosstab",
  notebook: "Query Notebook",
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
      <DialogContent
        data-testid={tool ? `tool-host-${tool}` : "tool-host"}
        className="flex! h-[88vh] max-h-[88vh] flex-col gap-2 overflow-hidden sm:max-w-[min(1200px,94vw)]"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {tool ? TITLES[tool] : ""}
            {connection ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {connection.name} ({connection.engine})
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {connection && tool === "admin" ? <AdminPanel connection={connection} /> : null}
          {connection && tool === "eer" ? (
            <EerDiagram connection={connection} onClose={onClose} />
          ) : null}
          {connection && tool === "compare" ? <SchemaCompare connection={connection} /> : null}
          {connection && tool === "dataCompare" ? (
            <DataCompare connection={connection} />
          ) : null}
          {connection && tool === "schemaSync" ? (
            <SchemaDataSync connection={connection} />
          ) : null}
          {connection && tool === "migrate" ? <MigrationWizard connection={connection} /> : null}
          {connection && tool === "fakeData" ? (
            <FakeDataFactory connection={connection} />
          ) : null}
          {connection && tool === "visualize" ? (
            <VisualizeData
              connection={connection}
              onMovedToTab={onClose}
            />
          ) : null}
          {connection && tool === "vqb" ? (
            <VisualQueryBuilder connection={connection} />
          ) : null}
          {connection && tool === "pivot" ? (
            <PivotTool connection={connection} />
          ) : null}
          {connection && tool === "notebook" ? (
            <QueryNotebook connection={connection} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
