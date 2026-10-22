/** Workbench-shaped Administration navigation. */

export type AdminViewId =
  | "serverStatus"
  | "connections"
  | "queryMonitor"
  | "users"
  | "variables"
  | "dataExport"
  | "dataImport"
  | "startupShutdown"
  | "logs"
  | "optionsFile"
  | "perfDashboard"
  | "perfReports"
  | "perfSchemaSetup";

export type AdminNavGroup = {
  id: string;
  label: string;
  items: { id: AdminViewId; label: string }[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    id: "management",
    label: "Management",
    items: [
      { id: "serverStatus", label: "Server Status" },
      { id: "connections", label: "Client Connections" },
      { id: "queryMonitor", label: "Query Monitor" },
      { id: "users", label: "Users and Privileges" },
      { id: "variables", label: "Status and System Variables" },
      { id: "dataExport", label: "Data Export" },
      { id: "dataImport", label: "Data Import/Restore" },
    ],
  },
  {
    id: "instance",
    label: "Instance",
    items: [
      { id: "startupShutdown", label: "Startup / Shutdown" },
      { id: "logs", label: "Server Logs" },
      { id: "optionsFile", label: "Options File" },
    ],
  },
  {
    id: "performance",
    label: "Performance",
    items: [
      { id: "perfDashboard", label: "Dashboard" },
      { id: "perfReports", label: "Performance Reports" },
      { id: "perfSchemaSetup", label: "Performance Schema Setup" },
    ],
  },
];

export const DEFAULT_ADMIN_VIEW: AdminViewId = "serverStatus";
