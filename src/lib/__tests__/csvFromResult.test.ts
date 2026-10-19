import { describe, expect, it } from "vitest";
import { csvFromResult } from "@/lib/csvFromResult";
import { sampleResult } from "./fixtures";

describe("csvFromResult", () => {
  it("emits header and rows", () => {
    const csv = csvFromResult(sampleResult);
    expect(csv).toBe("id,name\n1,Ada\n2,Alan");
  });

  it("escapes commas and quotes", () => {
    const csv = csvFromResult({
      columns: ["note"],
      rows: [['say "hi", please']],
      rowsAffected: null,
    });
    expect(csv).toContain('"say ""hi"", please"');
  });
});
