import { beforeEach, describe, expect, it } from "vitest";
import {
  dueSchedules,
  loadSchedules,
  markRan,
  saveSchedules,
} from "@/lib/backupSchedule";

describe("backupSchedule", () => {
  beforeEach(() => localStorage.clear());

  it("marks due when never ran", () => {
    saveSchedules([
      {
        connectionId: "c1",
        intervalHours: 1,
        lastRunAt: null,
        enabled: true,
      },
    ]);
    expect(dueSchedules().map((s) => s.connectionId)).toEqual(["c1"]);
    markRan("c1", Date.now());
    expect(dueSchedules()).toEqual([]);
    expect(loadSchedules()[0].lastRunAt).not.toBeNull();
  });
});
