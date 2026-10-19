import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminNav } from "@/components/admin/AdminNav";

describe("AdminNav", () => {
  it("renders groups and calls onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AdminNav active="serverStatus" onSelect={onSelect} />);

    expect(screen.getByTestId("admin-nav")).toBeInTheDocument();
    expect(screen.getByText("Management")).toBeInTheDocument();
    expect(screen.getByTestId("admin-view-users")).toHaveTextContent(
      "Users and Privileges",
    );

    await user.click(screen.getByTestId("admin-view-users"));
    expect(onSelect).toHaveBeenCalledWith("users");
  });
});
