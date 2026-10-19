import { describe, expect, it } from "vitest";
import {
  buildCreateTableSql,
  defaultNewTableColumns,
  hasExecutableSql,
  stripCommentLines,
} from "@/lib/tableDdl";

describe("tableDdl", () => {
  it("builds create table", () => {
    const cols = defaultNewTableColumns("mysql");
    const sql = buildCreateTableSql("mysql", "t", cols);
    expect(sql).toMatch(/CREATE TABLE `t`/);
    expect(sql).toMatch(/PRIMARY KEY/);
  });

  it("hasExecutableSql / stripCommentLines", () => {
    expect(hasExecutableSql("-- only\n")).toBe(false);
    expect(hasExecutableSql("-- c\nCREATE TABLE t (id INT);")).toBe(true);
    expect(stripCommentLines("-- c\nCREATE TABLE t (id INT);")).not.toContain(
      "--",
    );
  });
});
