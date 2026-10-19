import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("toggles dark class and storage", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const btn = screen.getByRole("button", { name: /switch to dark mode/i });
    await user.click(btn);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("re-dbviewer-theme")).toBe("dark");
    await user.click(
      screen.getByRole("button", { name: /switch to light mode/i }),
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
