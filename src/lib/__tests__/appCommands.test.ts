import { describe, expect, it, vi } from "vitest";
import {
  buildAppCommands,
  commandAvailable,
  filterCommands,
  type CommandContext,
} from "@/lib/appCommands";

function ctx(partial: Partial<CommandContext> = {}): CommandContext {
  return {
    connected: false,
    actions: null,
    openPrefs: vi.fn(),
    openShortcuts: vi.fn(),
    setTool: vi.fn(),
    toggleTheme: vi.fn(),
    bumpZoom: vi.fn(),
    resetZoom: vi.fn(),
    disconnect: vi.fn(),
    newWindow: vi.fn(),
    ...partial,
  };
}

describe("appCommands", () => {
  it("includes Preferences and Administration entries", () => {
    const all = buildAppCommands();
    expect(all.some((c) => c.id === "file.prefs")).toBe(true);
    expect(all.some((c) => c.id === "admin.queryMonitor")).toBe(true);
    expect(all.some((c) => c.id === "tools.visualize")).toBe(true);
    expect(all.some((c) => c.id === "tools.vqb")).toBe(true);
    expect(all.some((c) => c.id === "tools.data-compare")).toBe(true);
    expect(all.some((c) => c.id === "tools.schema-sync")).toBe(true);
    expect(all.some((c) => c.id === "tools.pivot")).toBe(true);
    expect(all.some((c) => c.id === "tools.notebook")).toBe(true);
    expect(all.some((c) => c.id === "tools.ai-sql")).toBe(true);
    expect(all.some((c) => c.id === "file.git-add-sql")).toBe(true);
  });

  it("gates connected and adminEngine commands", () => {
    const prefs = buildAppCommands().find((c) => c.id === "file.prefs")!;
    const query = buildAppCommands().find((c) => c.id === "file.new-query")!;
    const admin = buildAppCommands().find((c) => c.id === "admin.serverStatus")!;

    expect(commandAvailable(prefs, ctx())).toBe(true);
    expect(commandAvailable(query, ctx())).toBe(false);
    expect(commandAvailable(query, ctx({ connected: true }))).toBe(true);
    expect(commandAvailable(admin, ctx({ connected: true, engine: "sqlite" }))).toBe(
      false,
    );
    expect(
      commandAvailable(admin, ctx({ connected: true, engine: "mysql" })),
    ).toBe(true);
  });

  it("filterCommands matches title and keywords", () => {
    const c = ctx({ connected: true, engine: "mysql" });
    const hits = filterCommands("prefer", c);
    expect(hits.some((x) => /prefer/i.test(x.title))).toBe(true);

    const qm = filterCommands("query monitor", c);
    expect(qm.some((x) => x.id === "admin.queryMonitor")).toBe(true);

    expect(filterCommands("zzzz-no-match", c)).toHaveLength(0);
  });

  it("empty query returns all available for context", () => {
    const home = filterCommands("", ctx());
    expect(home.every((c) => c.when === "always")).toBe(true);
    expect(home.length).toBeGreaterThan(3);
  });

  it("includes open-connection tables when query matches", () => {
    const c = ctx({
      connected: true,
      engine: "mysql",
      tables: [
        { ref: "demo.users", name: "users", kind: "table", schema: "demo" },
        { ref: "demo.orders", name: "orders", kind: "table", schema: "demo" },
      ],
    });
    expect(filterCommands("", c).some((x) => x.id.startsWith("table."))).toBe(
      false,
    );
    const hits = filterCommands("users", c);
    expect(hits.some((x) => x.id === "table.demo.users")).toBe(true);
    expect(hits.find((x) => x.id === "table.demo.users")?.group).toBe("Tables");
  });
});
