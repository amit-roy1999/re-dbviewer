import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: unknown[]) => invoke(...a),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

import Home from "@/pages/Home";

describe("Home", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_connections") return [];
      if (cmd === "list_categories") return [];
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
});
