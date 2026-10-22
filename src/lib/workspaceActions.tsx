import { createContext, useContext } from "react";
import type { AdminViewId } from "@/lib/adminNav";

export type WorkspaceActions = {
  newQueryTab: () => void;
  closeActiveTab: () => void;
  openSqlFile: () => void;
  saveSqlFile: () => void;
  saveSqlFileAs: () => void;
  formatSql: () => void;
  toggleHistory: () => void;
  toggleSnippets: () => void;
  reconnect: () => void;
  exportQueryCsv: () => void;
  runScript: () => void;
  stopQuery: () => void;
  beginTx: () => void;
  commitTx: () => void;
  rollbackTx: () => void;
  toggleHelp: () => void;
  globalSearch: () => void;
  inspectTable: () => void;
  dumpSchema: (includeData?: boolean) => void;
  restoreSql: () => void;
  schemaInspector: () => void;
  dumpTables: () => void;
  /** Open Workbench-style Administration mode (Server Status). */
  openServerAdmin: () => void;
  /** Open Administration on a specific nav view. */
  openAdminView?: (id: AdminViewId) => void;
  /** Open a schema table/view (data tab). */
  openTable?: (ref: string) => void;
  /** Open SQL text in a new query tab (used by EER forward-engineer). */
  openSqlInTab?: (sql: string) => void;
  /** Open Visualize Data as a workspace tab (closes the tools dialog if open). */
  openVisualizeTab?: () => void;
};

const Ctx = createContext<WorkspaceActions | null>(null);

export const WorkspaceActionsProvider = Ctx.Provider;

export function useWorkspaceActions(): WorkspaceActions | null {
  return useContext(Ctx);
}
