import { describe, expect, it } from "vitest";
import { formatDiff, pendingDdlDiff } from "@/lib/pendingDdlDiff";

describe("pendingDdlDiff", () => {
  it("marks added and removed lines", () => {
    const d = pendingDdlDiff("a\nb", "a\nc");
    expect(formatDiff(d)).toContain("-b");
    expect(formatDiff(d)).toContain("+c");
    expect(formatDiff(d)).toContain(" a");
  });
});
