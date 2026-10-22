import type { RelationGraph } from "@/lib/relationGraph";
import type {
  JoinType,
  RelationFilter,
  SelectedColumns,
} from "@/lib/relationQuerySql";
import type { ChartConfig } from "@/lib/visualizeSpec";

export const VISUALIZE_FORMAT = "re-dbviewer.visualize";
export const VISUALIZE_VERSION = 1;

export type VisualizeQueryModel = {
  root: string;
  joinType: JoinType;
  selected: SelectedColumns;
  filters: RelationFilter[];
  graph: RelationGraph;
  limit: number;
};

export type VisualizeFileV1 = {
  format: typeof VISUALIZE_FORMAT;
  version: typeof VISUALIZE_VERSION;
  connectionHint: { name: string; engine: string };
  query: VisualizeQueryModel;
  chart: ChartConfig;
};

export function serializeVisualizeFile(doc: VisualizeFileV1): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function parseVisualizeFile(text: string): VisualizeFileV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON");
  }
  if (!raw || typeof raw !== "object") throw new Error("Invalid visualize file");
  const o = raw as Record<string, unknown>;
  if (o.format !== VISUALIZE_FORMAT) {
    throw new Error(`Unsupported format (expected ${VISUALIZE_FORMAT})`);
  }
  if (o.version !== VISUALIZE_VERSION) {
    throw new Error(`Unsupported version ${String(o.version)}`);
  }
  const hint = o.connectionHint as VisualizeFileV1["connectionHint"] | undefined;
  const query = o.query as VisualizeQueryModel | undefined;
  const chart = o.chart as ChartConfig | undefined;
  if (!hint?.name || !hint.engine) throw new Error("Missing connectionHint");
  if (!query?.root || !query.graph) throw new Error("Missing query model");
  if (!chart?.mark || !chart.encoding) throw new Error("Missing chart config");
  return {
    format: VISUALIZE_FORMAT,
    version: VISUALIZE_VERSION,
    connectionHint: { name: String(hint.name), engine: String(hint.engine) },
    query: {
      root: String(query.root),
      joinType: query.joinType === "INNER" ? "INNER" : "LEFT",
      selected: query.selected ?? {},
      filters: Array.isArray(query.filters) ? query.filters : [],
      graph: query.graph,
      limit:
        typeof query.limit === "number" && query.limit > 0 ? query.limit : 2000,
    },
    chart: {
      mark: chart.mark,
      encoding: {
        x: chart.encoding.x ?? null,
        y: chart.encoding.y ?? null,
        color: chart.encoding.color ?? null,
        size: chart.encoding.size ?? null,
      },
    },
  };
}

/** Append / wrap SQL with a row limit (portable across engines). */
export function sqlWithLimit(sql: string, engine: string, limit: number): string {
  const body = sql.trim().replace(/;+\s*$/, "");
  if (!body) return body;
  if (engine === "mssql") {
    return `SELECT TOP (${Math.floor(limit)}) * FROM (\n${body}\n) AS _rdbviz_lim`;
  }
  return `${body}\nLIMIT ${Math.floor(limit)}`;
}
