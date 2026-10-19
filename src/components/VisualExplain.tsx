import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { QueryResult } from "@/types";
import {
  ACCESS_LEGEND,
  bandFill,
  buildVisualExplain,
  type VisualExplainNode,
} from "@/lib/visualExplainModel";
import { cn } from "@/lib/utils";

type LayoutNode = {
  node: VisualExplainNode;
  x: number;
  y: number;
  w: number;
  h: number;
  /** For edges: join fans in from these laid-out inputs. */
  children: LayoutNode[];
};

const BOX_W = 140;
const BOX_H = 40;
const JOIN_S = 44;
const GAP_X = 36;
const GAP_Y = 14;
const PAD = 16;

function leafH(node: VisualExplainNode): number {
  const labels = (node.table ? 1 : 0) + (node.key ? 1 : 0);
  return BOX_H + (labels ? 2 + labels * 11 : 0);
}

/** Flatten a pure binary nested-loop chain into ordered leaf inputs. */
function joinInputs(node: VisualExplainNode): VisualExplainNode[] | null {
  if (node.kind !== "join") return null;
  if (node.children.length !== 2) {
    return node.children.length >= 2 ? node.children : null;
  }
  const out: VisualExplainNode[] = [];
  const walk = (n: VisualExplainNode): boolean => {
    if (n.kind !== "join") {
      out.push(n);
      return true;
    }
    if (n.children.length !== 2) {
      out.push(...n.children);
      return n.children.length > 0;
    }
    return walk(n.children[0]) && walk(n.children[1]);
  };
  return walk(node) && out.length >= 2 ? out : null;
}

function measure(node: VisualExplainNode): { w: number; h: number } {
  if (!node.children.length) {
    return {
      w: node.kind === "join" ? JOIN_S : BOX_W,
      h: node.kind === "join" ? JOIN_S : leafH(node),
    };
  }

  const inputs = joinInputs(node);
  if (inputs) {
    const sizes = inputs.map(measure);
    return {
      w: Math.max(...sizes.map((s) => s.w)) + GAP_X + JOIN_S,
      h: Math.max(
        sizes.reduce((s, k) => s + k.h, 0) + GAP_Y * (sizes.length - 1),
        JOIN_S,
      ),
    };
  }

  const kids = node.children.map(measure);
  const selfW = node.kind === "join" ? JOIN_S : BOX_W;
  const selfH = node.kind === "join" ? JOIN_S : leafH(node);
  return {
    w: Math.max(
      selfW,
      kids.reduce((s, k) => s + k.w, 0) + GAP_X * (kids.length - 1),
    ),
    h: selfH + GAP_Y + Math.max(...kids.map((k) => k.h)),
  };
}

function layout(
  node: VisualExplainNode,
  left: number,
  top: number,
): LayoutNode {
  const selfW = node.kind === "join" ? JOIN_S : BOX_W;
  const selfH = node.kind === "join" ? JOIN_S : BOX_H;

  if (!node.children.length) {
    return { node, x: left, y: top, w: selfW, h: selfH, children: [] };
  }

  const inputs = joinInputs(node);
  if (inputs) {
    const sizes = inputs.map(measure);
    const kidsW = Math.max(...sizes.map((s) => s.w));
    const stackH =
      sizes.reduce((s, k) => s + k.h, 0) + GAP_Y * (sizes.length - 1);
    const children: LayoutNode[] = [];
    let y = top;
    for (let i = 0; i < inputs.length; i++) {
      children.push(layout(inputs[i], left, y));
      y += sizes[i].h + GAP_Y;
    }
    return {
      node,
      x: left + kidsW + GAP_X,
      y: top + Math.max(0, (stackH - JOIN_S) / 2),
      w: JOIN_S,
      h: JOIN_S,
      children,
    };
  }

  const size = measure(node);
  const kidSizes = node.children.map(measure);
  const kidsTotal =
    kidSizes.reduce((s, k) => s + k.w, 0) + GAP_X * (kidSizes.length - 1);
  let kx = left + (size.w - kidsTotal) / 2;
  const childTop = top + selfH + GAP_Y;
  const children: LayoutNode[] = [];
  for (let i = 0; i < node.children.length; i++) {
    children.push(layout(node.children[i], kx, childTop));
    kx += kidSizes[i].w + GAP_X;
  }
  return {
    node,
    x: left + (size.w - selfW) / 2,
    y: top,
    w: selfW,
    h: selfH,
    children,
  };
}

function fmt(n?: number): string {
  if (n == null || !Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  if (n >= 100) return n.toFixed(0);
  return n.toFixed(2);
}

function Edges({ layout: L }: { layout: LayoutNode }) {
  const lines: ReactNode[] = [];
  const walk = (p: LayoutNode) => {
    const fanIn = p.node.kind === "join" && p.children.length >= 2;
    for (const c of p.children) {
      if (fanIn) {
        const x1 = c.x + c.w;
        const y1 = c.y + c.h / 2;
        const x2 = p.x;
        const y2 = p.y + p.h / 2;
        const mid = x1 + Math.min(24, (x2 - x1) / 2);
        lines.push(
          <path
            key={`${p.node.id}-${c.node.id}`}
            d={`M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2} ${y2}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.25}
            className="text-muted-foreground/70"
            markerEnd="url(#ve-arrow)"
          />,
        );
      } else {
        const x1 = p.x + p.w / 2;
        const y1 = p.y + p.h;
        const x2 = c.x + c.w / 2;
        const y2 = c.y;
        const mid = (y1 + y2) / 2;
        lines.push(
          <path
            key={`${p.node.id}-${c.node.id}`}
            d={`M ${x1} ${y1} L ${x1} ${mid} L ${x2} ${mid} L ${x2} ${y2}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.25}
            className="text-muted-foreground/70"
            markerEnd="url(#ve-arrow)"
          />,
        );
      }
      walk(c);
    }
  };
  walk(L);
  return <>{lines}</>;
}

function NodeShape({
  L,
  selected,
  onSelect,
}: {
  L: LayoutNode;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { node, x, y, w, h } = L;
  const fill = bandFill(node.band);
  const active = selected === node.id;
  const cost = fmt(node.cost);
  const rows = fmt(node.rows);
  const shapes: ReactNode[] = [];

  if (node.kind === "join") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = w / 2 - 2;
    shapes.push(
      <polygon
        key="d"
        points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
        fill={fill}
        stroke={active ? "#111" : "rgba(0,0,0,0.25)"}
        strokeWidth={active ? 2 : 1}
      />,
    );
    shapes.push(
      <text
        key="t"
        x={cx}
        y={cy + 3}
        textAnchor="middle"
        fill="#fff"
        fontSize={10}
        fontFamily="ui-monospace, monospace"
        fontWeight={600}
      >
        join
      </text>,
    );
  } else {
    shapes.push(
      <rect
        key="r"
        x={x}
        y={y}
        width={w}
        height={h}
        rx={node.kind === "op" ? 14 : 6}
        fill={fill}
        stroke={active ? "#111" : "rgba(0,0,0,0.2)"}
        strokeWidth={active ? 2 : 1}
      />,
    );
    const lines = node.title.split("\n").filter(Boolean).slice(0, 2);
    const startY = y + (lines.length === 1 ? h / 2 + 4 : h / 2 - 3);
    lines.forEach((line, i) => {
      shapes.push(
        <text
          key={`l${i}`}
          x={x + w / 2}
          y={startY + i * 11}
          textAnchor="middle"
          fill="#fff"
          fontSize={10}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontWeight={600}
        >
          {line.length > 20 ? `${line.slice(0, 19)}…` : line}
        </text>,
      );
    });
  }

  if (cost) {
    shapes.push(
      <text
        key="cost"
        x={x + 4}
        y={y - 4}
        fill="currentColor"
        fontSize={9}
        fontFamily="ui-monospace, monospace"
        className="text-foreground"
      >
        {cost}
      </text>,
    );
  }
  if (rows) {
    shapes.push(
      <text
        key="rows"
        x={node.kind === "join" ? x + w / 2 : x + w - 4}
        y={y - 4}
        textAnchor={node.kind === "join" ? "middle" : "end"}
        fill="currentColor"
        fontSize={9}
        fontFamily="ui-monospace, monospace"
        className="text-muted-foreground"
      >
        {rows} rows
      </text>,
    );
  }

  const labelY = y + h + 11;
  if (node.table) {
    shapes.push(
      <text
        key="tbl"
        x={x + w / 2}
        y={labelY}
        textAnchor="middle"
        fill="currentColor"
        fontSize={10}
        fontFamily="ui-monospace, monospace"
        className="text-foreground"
      >
        {node.table.length > 20 ? `${node.table.slice(0, 19)}…` : node.table}
      </text>,
    );
  }
  if (node.key) {
    shapes.push(
      <text
        key="key"
        x={x + w / 2}
        y={labelY + (node.table ? 11 : 0)}
        textAnchor="middle"
        fill="currentColor"
        fontSize={9}
        fontFamily="ui-monospace, monospace"
        fontWeight={700}
        className="text-foreground"
      >
        {node.key.length > 22 ? `${node.key.slice(0, 21)}…` : node.key}
      </text>,
    );
  }

  return (
    <g
      role="button"
      tabIndex={0}
      className="cursor-pointer outline-none"
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(node.id);
      }}
    >
      <title>
        {`${node.title.replace(/\n/g, " ")}${node.table ? `\n${node.table}` : ""}${node.key ? `\nkey: ${node.key}` : ""}\n${node.tip}`}
      </title>
      {shapes}
      {L.children.map((c) => (
        <NodeShape
          key={c.node.id}
          L={c}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </g>
  );
}

export function VisualExplain({ result }: { result: QueryResult }) {
  const roots = useMemo(() => buildVisualExplain(result), [result]);
  const [selected, setSelected] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: 640, h: 360 });

  const laid = useMemo(() => {
    if (!roots.length) return null;
    const pads = roots.map((r) => ({ r, m: measure(r) }));
    const totalW =
      pads.reduce((s, p) => s + p.m.w, 0) +
      GAP_X * Math.max(0, pads.length - 1);
    const totalH = Math.max(...pads.map((p) => p.m.h));
    let x = PAD;
    const layouts: LayoutNode[] = [];
    for (const p of pads) {
      layouts.push(layout(p.r, x, PAD + 6));
      x += p.m.w + GAP_X;
    }
    return {
      layouts,
      totalW: Math.max(totalW + PAD * 2, 280),
      totalH: Math.max(totalH + PAD * 2 + 6, 120),
    };
  }, [roots]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setViewport({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selectedNode = useMemo(() => {
    if (!selected || !roots.length) return null;
    const stack = [...roots];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.id === selected) return n;
      stack.push(...n.children);
    }
    return null;
  }, [selected, roots]);

  if (!laid || !roots.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        No plan steps to visualize. Try Explain again (Postgres JSON / MySQL
        tabular work best).
      </div>
    );
  }

  // Fit diagram inside the panel — no need to zoom the whole app.
  const fit = Math.min(
    1,
    (viewport.w - 8) / laid.totalW,
    (viewport.h - 8) / laid.totalH,
  );
  const svgW = laid.totalW * fit;
  const svgH = laid.totalH * fit;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          Visual Explain — cost top-left, rows top-right
          {fit < 0.99 ? ` · fitted ${Math.round(fit * 100)}%` : ""}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {ACCESS_LEGEND.map((l) => (
            <span
              key={l.band}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
            >
              <span
                className="inline-block size-2.5 rounded-sm"
                style={{ backgroundColor: bandFill(l.band) }}
              />
              {l.label}
            </span>
          ))}
        </div>
      </div>
      <div
        ref={viewportRef}
        className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:16px_16px]"
      >
        <div className="flex h-full w-full items-start justify-start p-1">
          <svg
            width={svgW}
            height={svgH}
            viewBox={`0 0 ${laid.totalW} ${laid.totalH}`}
            className="max-h-full max-w-full shrink-0 text-foreground"
            preserveAspectRatio="xMinYMin meet"
          >
            <defs>
              <marker
                id="ve-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" className="fill-muted-foreground" />
              </marker>
            </defs>
            {laid.layouts.map((L) => (
              <g key={L.node.id}>
                <Edges layout={L} />
                <NodeShape
                  L={L}
                  selected={selected}
                  onSelect={setSelected}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
      {selectedNode ? (
        <div
          className={cn(
            "shrink-0 border-t border-border px-3 py-2 font-mono text-[11px]",
          )}
        >
          <div className="font-semibold whitespace-pre-wrap text-foreground">
            {selectedNode.title}
          </div>
          {selectedNode.table ? (
            <div className="text-muted-foreground">
              table: {selectedNode.table}
            </div>
          ) : null}
          {selectedNode.key ? (
            <div className="text-muted-foreground">
              key: {selectedNode.key}
            </div>
          ) : null}
          <div className="text-muted-foreground">
            {[
              selectedNode.cost != null
                ? `cost ${fmt(selectedNode.cost)}`
                : null,
              selectedNode.rows != null
                ? `rows ${fmt(selectedNode.rows)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
            {selectedNode.tip}
          </div>
        </div>
      ) : null}
    </div>
  );
}
