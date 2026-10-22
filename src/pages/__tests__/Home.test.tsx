import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: unknown[]) => invoke(...a),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

import Home from "@/pages/Home";

const vaultUnlocked = {
  exists: true,
  unlocked: true,
  keyringAvailable: true,
};

describe("Home", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_connections") return [];
      if (cmd === "list_categories") return [];
      if (cmd === "vault_status") return vaultUnlocked;
      return null;
    });
  });

  it("opens new connection dialog", async () => {
    const user = userEvent.setup();
    render(<Home onOpen={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("home-root")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("btn-new-connection"));
    expect(screen.getByText("New connection")).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it("shows Store in Vault for MySQL and sends storePassword on save", async () => {
    const user = userEvent.setup();
    render(<Home onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("home-root")).toBeInTheDocument());

    await user.click(screen.getByTestId("btn-new-connection"));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^MySQL$/ }));
    const store = within(dialog).getByTestId("store-password-checkbox");
    expect(store).toBeChecked();

    await user.type(within(dialog).getByLabelText(/^name$/i), "Vaulted");
    await user.type(within(dialog).getByPlaceholderText("127.0.0.1"), "127.0.0.1");
    await user.click(store);
    expect(store).not.toBeChecked();

    invoke.mockImplementation(async (cmd: string, args?: { config?: { storePassword?: boolean } }) => {
      if (cmd === "list_connections") return [];
      if (cmd === "list_categories") return [];
      if (cmd === "vault_status") return vaultUnlocked;
      if (cmd === "save_connection") {
        expect(args?.config?.storePassword).toBe(false);
        return {
          id: "c1",
          name: "Vaulted",
          engine: "mysql",
          categoryId: null,
          categoryName: null,
          isFavorite: false,
          accentColor: "#2563eb",
          config: args?.config ?? {},
          permissions: {
            allowSelect: true,
            allowInsert: true,
            allowUpdate: true,
            allowDelete: true,
            allowDdl: true,
          },
        };
      }
      return null;
    });

    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "save_connection",
        expect.objectContaining({
          config: expect.objectContaining({ storePassword: false }),
        }),
      );
    });
  });

  it("opens unlock dialog when save needs vault", async () => {
    const user = userEvent.setup();
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_connections") return [];
      if (cmd === "list_categories") return [];
      if (cmd === "vault_status") {
        return { exists: false, unlocked: false, keyringAvailable: false };
      }
      if (cmd === "save_connection") {
        throw new Error(
          "OS keyring unavailable and vault is locked. Unlock the vault to store the password securely.",
        );
      }
      return null;
    });

    render(<Home onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("home-root")).toBeInTheDocument());
    await user.click(screen.getByTestId("btn-new-connection"));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^MySQL$/ }));
    await user.type(within(dialog).getByLabelText(/^name$/i), "Needs vault");
    await user.type(within(dialog).getByPlaceholderText("127.0.0.1"), "127.0.0.1");
    await user.type(within(dialog).getByLabelText(/^password$/i), "secret");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("vault-unlock-dialog")).toBeInTheDocument();
    });
    expect(screen.getByText(/create password vault/i)).toBeInTheDocument();
  });

  it("clear stored password invokes clear_connection_password", async () => {
    const user = userEvent.setup();
    const stored = {
      id: "c-stored",
      name: "Stored",
      engine: "mysql",
      categoryId: null,
      categoryName: null,
      isFavorite: false,
      accentColor: "#2563eb",
      config: {
        host: "127.0.0.1",
        port: 3306,
        user: "root",
        database: "demo",
        passwordInKeyring: true,
        storePassword: true,
      },
      permissions: {
        allowSelect: true,
        allowInsert: true,
        allowUpdate: true,
        allowDelete: true,
        allowDdl: true,
      },
    };
    invoke.mockImplementation(async (cmd: string, args?: { id?: string }) => {
      if (cmd === "list_connections") return [stored];
      if (cmd === "list_categories") return [];
      if (cmd === "vault_status") return vaultUnlocked;
      if (cmd === "clear_connection_password") {
        expect(args?.id).toBe("c-stored");
        return null;
      }
      return null;
    });

    render(<Home onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Stored")).toBeInTheDocument());
    await waitFor(() => {
      expect(screen.getByTestId("btn-conn-menu-c-stored")).not.toBeDisabled();
    });
    await user.click(screen.getByTestId("btn-conn-menu-c-stored"));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/password stored securely/i)).toBeInTheDocument();
    await user.click(within(dialog).getByTestId("clear-stored-password"));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("clear_connection_password", { id: "c-stored" });
    });
  });
});
