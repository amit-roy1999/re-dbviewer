import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SavedConnection } from "@/types";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: unknown[]) => invoke(...a),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

import { VisualizeData } from "@/components/tools/VisualizeData";

const connection: SavedConnection = {
  id: "c1",
  name: "Demo",
  engine: "mysql",
  categoryId: null,
  categoryName: null,
  isFavorite: false,
  accentColor: "#2563eb",
  config: { host: "127.0.0.1", database: "demo" },
  permissions: {
    allowSelect: true,
    allowInsert: true,
    allowUpdate: true,
    allowDelete: true,
    allowDdl: true,
  },
};

describe("VisualizeData", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_schema") {
        return [
          {
            name: "demo",
            kind: "schema",
            children: [{ name: "users", kind: "table", children: [] }],
          },
        ];
      }
      if (cmd === "describe_table") {
        return {
          columns: [
            { name: "id", dataType: "INT", nullable: false, defaultValue: null, isPk: true },
            { name: "name", dataType: "VARCHAR", nullable: true, defaultValue: null, isPk: false },
          ],
          foreignKeys: [],
          indexes: [],
        };
      }
      if (cmd === "run_sql") {
        return { columns: ["id", "name"], rows: [[1, "Ada"]], rowsAffected: null };
      }
      return null;
    });
  });

  it("renders schema/table pickers and chart step prompt before run", async () => {
    const user = userEvent.setup();
    render(<VisualizeData connection={connection} />);
    await waitFor(() => {
      expect(screen.getByTestId("visualize-data")).toBeInTheDocument();
    });
    expect(screen.getByTestId("visualize-schema")).toBeInTheDocument();
    expect(screen.getByTestId("visualize-table")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /2\.\s*Chart/i }));
    expect(screen.getByText(/run a query on the data step first/i)).toBeInTheDocument();
  });

  it("hides Open as tab when embedded", async () => {
    render(<VisualizeData connection={connection} embedded />);
    await waitFor(() => {
      expect(screen.getByTestId("visualize-data")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("visualize-open-as-tab")).not.toBeInTheDocument();
  });
});
