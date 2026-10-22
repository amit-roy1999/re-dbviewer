import { describe, expect, it } from "vitest";
import {
  parseVisualizeFile,
  serializeVisualizeFile,
  sqlWithLimit,
  VISUALIZE_FORMAT,
  VISUALIZE_VERSION,
  type VisualizeFileV1,
} from "@/lib/visualizeFile";

const sample: VisualizeFileV1 = {
  format: VISUALIZE_FORMAT,
  version: VISUALIZE_VERSION,
  connectionHint: { name: "Demo MySQL", engine: "mysql" },
  query: {
    root: "demo.users",
    joinType: "LEFT",
    selected: { "demo.users": ["id", "name"] },
    filters: [],
    graph: {
      rootId: "demo.users",
      nodes: [
        {
          id: "demo.users",
          ref: "demo.users",
          name: "users",
          details: null,
          included: true,
          expanded: true,
          isRoot: true,
          x: 0,
          y: 0,
          w: 200,
          h: 40,
        },
      ],
      edges: [],
    },
    limit: 2000,
  },
  chart: {
    mark: "bar",
    encoding: { x: "name", y: "id", color: null, size: null },
  },
};

describe("visualizeFile", () => {
  it("round-trips serialize and parse", () => {
    const text = serializeVisualizeFile(sample);
    const doc = parseVisualizeFile(text);
    expect(doc.format).toBe(VISUALIZE_FORMAT);
    expect(doc.version).toBe(VISUALIZE_VERSION);
    expect(doc.connectionHint).toEqual(sample.connectionHint);
    expect(doc.query.root).toBe("demo.users");
    expect(doc.query.limit).toBe(2000);
    expect(doc.chart.mark).toBe("bar");
    expect(doc.chart.encoding.x).toBe("name");
  });

  it("rejects bad format / version / missing fields", () => {
    expect(() => parseVisualizeFile("{")).toThrow(/valid JSON/i);
    expect(() =>
      parseVisualizeFile(JSON.stringify({ format: "other", version: 1 })),
    ).toThrow(/Unsupported format/);
    expect(() =>
      parseVisualizeFile(
        JSON.stringify({ ...sample, version: 99 }),
      ),
    ).toThrow(/Unsupported version/);
    expect(() =>
      parseVisualizeFile(
        JSON.stringify({
          format: VISUALIZE_FORMAT,
          version: 1,
          connectionHint: { name: "x", engine: "mysql" },
        }),
      ),
    ).toThrow(/Missing query/);
  });

  it("sqlWithLimit wraps SELECT for mysql and mssql", () => {
    const sql = "SELECT id FROM t";
    expect(sqlWithLimit(sql, "mysql", 100)).toBe(
      "SELECT id FROM t\nLIMIT 100",
    );
    expect(sqlWithLimit(sql + ";", "postgres", 50)).toContain("LIMIT 50");
    expect(sqlWithLimit(sql, "mssql", 10)).toMatch(
      /SELECT TOP \(10\) \* FROM \(/,
    );
  });
});
