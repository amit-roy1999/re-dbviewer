import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { SavedConnection } from "@/types";
import { FULL_PERMISSIONS } from "@/types";

vi.mock("@/lib/dbApi", () => ({
  runSql: vi.fn().mockResolvedValue({
    columns: ["Variable_name", "Value"],
    rows: [["Uptime", "100"]],
    rowsAffected: null,
  }),
  runScript: vi.fn().mockResolvedValue(0),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn().mockResolvedValue(false),
}));

import { AdminWorkbench } from "@/components/admin/AdminWorkbench";

const connection: SavedConnection = {
  id: "c1",
  name: "Demo",
  engine: "mysql",
  categoryId: null,
  categoryName: null,
  isFavorite: false,
  accentColor: "#2563eb",
  config: { host: "127.0.0.1", port: 3306 },
  permissions: FULL_PERMISSIONS,
};

describe("AdminWorkbench", () => {
  it("loads server status view without throwing", async () => {
    render(
      <AdminWorkbench
        connection={connection}
        view="serverStatus"
        actions={{
          dumpSchema: vi.fn(),
          dumpTables: vi.fn(),
          restoreSql: vi.fn(),
        }}
      />,
    );

    expect(screen.getByTestId("admin-workbench")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Server Status/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Demo")).toBeInTheDocument();
  });

  it("shows unsupported message for sqlite", () => {
    render(
      <AdminWorkbench
        connection={{ ...connection, engine: "sqlite" }}
        view="serverStatus"
        actions={{
          dumpSchema: vi.fn(),
          dumpTables: vi.fn(),
          restoreSql: vi.fn(),
        }}
      />,
    );
    expect(screen.getByText(/supports MySQL/i)).toBeInTheDocument();
  });
});
