import { beforeEach, describe, expect, it } from "vitest";
import { loadHistory, pushHistory } from "@/lib/queryHistory";
import {
  deleteUserSnippet,
  listSnippets,
  saveUserSnippet,
} from "@/lib/snippets";
import { deleteBookmark, listBookmarks, saveBookmark } from "@/lib/bookmarks";
import {
  listTemplates,
  parseColumnDefs,
  saveTemplates,
} from "@/lib/tableTemplates";

describe("localStorage helpers", () => {
  beforeEach(() => localStorage.clear());

  it("query history", () => {
    pushHistory("c1", {
      sql: "SELECT 1",
      ok: true,
      durationMs: 12,
      message: "ok",
    });
    expect(loadHistory("c1")).toHaveLength(1);
    expect(loadHistory("other")).toHaveLength(0);
  });

  it("snippets", () => {
    const before = listSnippets("c1");
    expect(before.some((s) => s.builtin)).toBe(true);
    const all = saveUserSnippet("c1", "n", "SELECT 1");
    const user = all.find((x) => !x.builtin && x.title === "n");
    expect(user).toBeTruthy();
    deleteUserSnippet("c1", user!.id);
    expect(listSnippets("c1").some((x) => x.id === user!.id)).toBe(false);
  });

  it("bookmarks", () => {
    const list = saveBookmark("c1", "q", "SELECT 1");
    expect(list).toHaveLength(1);
    expect(listBookmarks("c1")[0].body).toBe("SELECT 1");
    deleteBookmark("c1", list[0].id);
    expect(listBookmarks("c1")).toHaveLength(0);
  });

  it("table templates", () => {
    saveTemplates([
      {
        name: "t",
        columns: [
          {
            name: "id",
            dataType: "INT",
            nullable: false,
            defaultValue: "",
            isPk: true,
          },
        ],
      },
    ]);
    expect(listTemplates().some((t) => t.name === "t")).toBe(true);
    expect(
      parseColumnDefs('[{"name":"a","dataType":"TEXT"}]')[0].name,
    ).toBe("a");
  });
});
