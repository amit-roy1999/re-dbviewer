import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import { ResultGrid } from "@/components/ResultGrid";
import { sampleResult } from "@/lib/__tests__/fixtures";

describe("ResultGrid", () => {
  it("renders columns and rows", () => {
    render(<ResultGrid result={sampleResult} />);
    const grid = screen.getByTestId("result-grid");
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveTextContent("id");
    expect(grid).toHaveTextContent("name");
    expect(grid).toHaveTextContent("Ada");
    expect(grid).toHaveTextContent("Alan");
  });
});
