import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SavedConnection } from "@/types";
import { FULL_PERMISSIONS } from "@/types";

const invoke = vi.fn();
const listSchema = vi.fn();
const describeTable = vi.fn();
const confirm = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: (...args: unknown[]) => confirm(...args),
}));

vi.mock("@/lib/dbApi", () => ({
  listSchema: (...args: unknown[]) => listSchema(...args),
  describeTable: (...args: unknown[]) => describeTable(...args),
  flattenTables: () => [{ schema: null, name: "users", ref: "users", kind: "table" }],
  shortName: (t: string) => (t.includes(".") ? t.split(".").pop()! : t),
}));

vi.mock("@/lib/relationInbound", () => ({
  loadInboundFks: vi.fn().mockResolvedValue([]),
}));

import { FakeDataFactory } from "@/components/tools/FakeDataFactory";

function conn(perms: Partial<typeof FULL_PERMISSIONS> = {}): SavedConnection {
  return {
    id: "c1",
    name: "Demo",
    engine: "sqlite",
    categoryId: null,
    categoryName: null,
    isFavorite: false,
    accentColor: "#2563eb",
    config: { path: "/tmp/t.sqlite" },
    permissions: { ...FULL_PERMISSIONS, ...perms },
  };
}

describe("FakeDataFactory", () => {
  beforeEach(() => {
    cleanup();
    invoke.mockReset();
    listSchema.mockReset();
    describeTable.mockReset();
    confirm.mockReset();
    listSchema.mockResolvedValue([]);
    describeTable.mockResolvedValue({
      columns: [
        {
          name: "id",
          dataType: "INTEGER",
          nullable: false,
          defaultValue: null,
          isPk: true,
        },
        {
          name: "email",
          dataType: "TEXT",
          nullable: true,
          defaultValue: null,
          isPk: false,
        },
      ],
      foreignKeys: [],
      indexes: [],
    });
    invoke.mockResolvedValue({ tables: 1, rows: 50, log: ["ok"] });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows alert when insert is disabled", () => {
    render(<FakeDataFactory connection={conn({ allowInsert: false })} />);
    expect(
      screen.getByText(/INSERT is disabled for this connection/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("fake-data-factory")).not.toBeInTheDocument();
  });

  it("invokes generate_fake_data with plan shape", async () => {
    const user = userEvent.setup();
    render(<FakeDataFactory connection={conn()} />);

    const root = await screen.findByTestId("fake-data-factory");

    await user.click(within(root).getByRole("checkbox"));
    await waitFor(() => {
      expect(describeTable).toHaveBeenCalled();
    });

    const generate = await within(root).findByRole("button", { name: /Generate/i });
    await waitFor(() => {
      expect(generate).not.toBeDisabled();
    });

    await user.click(generate);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "generate_fake_data",
        expect.objectContaining({
          connectionId: "c1",
          plan: expect.objectContaining({
            mode: "append",
            tables: expect.arrayContaining([
              expect.objectContaining({
                table: "users",
                rowCount: expect.any(Number),
                columns: expect.any(Array),
              }),
            ]),
          }),
        }),
      );
    });
  });

  it("disables clear-then-fill without delete or ddl", async () => {
    const user = userEvent.setup();
    render(
      <FakeDataFactory
        connection={conn({ allowDelete: false, allowDdl: false })}
      />,
    );
    const root = await screen.findByTestId("fake-data-factory");

    await user.click(within(root).getByRole("checkbox"));
    await waitFor(() => {
      expect(within(root).getByText(/Clear, then fill/i)).toBeInTheDocument();
    });

    expect(
      within(root).getByRole("button", { name: /Clear, then fill/i }),
    ).toBeDisabled();
    expect(
      within(root).getByText(/Clear-then-fill needs DELETE or DDL/i),
    ).toBeInTheDocument();
  });
});
