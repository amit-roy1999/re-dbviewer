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
    // Default theme is dark on first launch.
    const btn = screen.getByRole("button", { name: /switch to light mode/i });
    await user.click(btn);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("re-dbviewer-theme")).toBe("light");
    await user.click(
      screen.getByRole("button", { name: /switch to dark mode/i }),
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
