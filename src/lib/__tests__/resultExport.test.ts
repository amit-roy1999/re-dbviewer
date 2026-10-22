import { describe, expect, it } from "vitest";
import {
  formatResult,
  resultToHtml,
  resultToInserts,
  resultToJson,
  resultToMarkdown,
  resultToXml,
} from "@/lib/resultExport";
import { sampleResult } from "./fixtures";

describe("resultExport", () => {
  it("json", () => {
    const j = JSON.parse(resultToJson(sampleResult));
    expect(j).toEqual([
      { id: 1, name: "Ada" },
      { id: 2, name: "Alan" },
    ]);
  });

  it("markdown has header separator", () => {
    const md = resultToMarkdown(sampleResult);
    expect(md).toContain("| id | name |");
    expect(md).toContain("| --- | --- |");
  });

  it("inserts and formatResult", () => {
    expect(resultToInserts(sampleResult, "users", "sqlite")).toMatch(
      /INSERT INTO/,
    );
    const csvFn = (r: typeof sampleResult) => r.columns.join(",");
    expect(formatResult("csv", sampleResult, "t", "sqlite", csvFn)).toBe(
      "id,name",
    );
    expect(
      formatResult("json", sampleResult, "t", "sqlite", csvFn),
    ).toContain("Ada");
  });

  it("html and xml", () => {
    expect(resultToHtml(sampleResult)).toMatch(/<table>/);
    expect(resultToHtml(sampleResult)).toContain("<th>id</th>");
    expect(resultToXml(sampleResult)).toMatch(/<\?xml/);
    expect(resultToXml(sampleResult)).toContain("<name>Ada</name>");
  });
});
