import { createContext, useContext } from "react";

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
  dumpSchema: () => void;
  restoreSql: () => void;
  schemaInspector: () => void;
  dumpTables: () => void;
  /** Open SQL text in a new query tab (used by EER forward-engineer). */
  openSqlInTab?: (sql: string) => void;
};

const Ctx = createContext<WorkspaceActions | null>(null);

export const WorkspaceActionsProvider = Ctx.Provider;

export function useWorkspaceActions(): WorkspaceActions | null {
  return useContext(Ctx);
}
