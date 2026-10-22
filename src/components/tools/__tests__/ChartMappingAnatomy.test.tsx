import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartMappingAnatomy } from "@/components/tools/ChartMappingAnatomy";

describe("ChartMappingAnatomy", () => {
  it("shows mapped table.column callouts for a bar chart", () => {
    render(
      <ChartMappingAnatomy
        mark="bar"
        encoding={{
          x: "categories.name",
          y: "order_items.amount",
          color: "regions.name",
          size: null,
        }}
      />,
    );
    expect(screen.getByTestId("chart-mapping-anatomy")).toBeInTheDocument();
    expect(screen.getAllByText("categories.name").length).toBeGreaterThan(0);
    expect(screen.getAllByText("order_items.amount").length).toBeGreaterThan(0);
    expect(screen.getAllByText("regions.name").length).toBeGreaterThan(0);
  });
});
