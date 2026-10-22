import type { ChartEncoding, ChartMark } from "@/lib/visualizeSpec";
import { cn } from "@/lib/utils";

type Props = {
  mark: ChartMark;
  encoding: ChartEncoding;
  className?: string;
};

function tag(label: string, field: string | null, role: string) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]",
        field
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-dashed border-border text-muted-foreground",
      )}
      title={field ? `${role}: ${field}` : `${role}: not set`}
    >
      <span className="shrink-0 font-sans text-[9px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="min-w-0 truncate">{field ?? "—"}</span>
    </span>
  );
}

/** Compact schematic showing which encoding drives which part of the chart. */
export function ChartMappingAnatomy({ mark, encoding, className }: Props) {
  const { x, y, color, size } = encoding;

  return (
    <div
      data-testid="chart-mapping-anatomy"
      className={cn(
        "flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2",
        className,
      )}
    >
      <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        Mapping preview
      </div>

      {mark === "table" ? (
        <p className="text-[11px] text-muted-foreground">
          Table mode uses every result column — no X/Y mapping.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="flex min-h-[140px] items-center justify-center rounded border border-border/60 bg-card p-2">
            <AnatomySvg mark={mark} />
          </div>
          <div className="flex flex-col justify-center gap-1.5 sm:min-w-[11rem]">
            {(mark === "arc"
              ? [
                  ["Color", color, "slices"],
                  ["Y / value", y, "slice size"],
                ]
              : mark === "rect"
                ? [
                    ["X", x, "columns"],
                    ["Y", y, "rows"],
                    ["Color", color, "cell fill"],
                  ]
                : mark === "point"
                  ? [
                      ["X", x, "horizontal"],
                      ["Y", y, "vertical"],
                      ["Color", color, "point color"],
                      ["Size", size, "point size"],
                    ]
                  : [
                      ["X", x, "horizontal axis"],
                      ["Y", y, "vertical axis"],
                      ["Color", color, "series"],
                    ]
            ).map(([label, field, role]) => (
              <div key={label as string}>
                {tag(label as string, field as string | null, role as string)}
              </div>
            ))}
          </div>
        </div>
      )}

      {mark !== "table" ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
          <span>
            <span className="text-foreground/80">X</span> →{" "}
            <span className="font-mono">{x ?? "—"}</span>
          </span>
          <span>
            <span className="text-foreground/80">Y</span> →{" "}
            <span className="font-mono">{y ?? "—"}</span>
          </span>
          <span>
            <span className="text-foreground/80">Color</span> →{" "}
            <span className="font-mono">{color ?? "—"}</span>
          </span>
          {mark === "point" ? (
            <span>
              <span className="text-foreground/80">Size</span> →{" "}
              <span className="font-mono">{size ?? "—"}</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AnatomySvg({ mark }: { mark: ChartMark }) {
  const axis = (
    <>
      <line
        x1="28"
        y1="12"
        x2="28"
        y2="88"
        className="stroke-muted-foreground/50"
        strokeWidth="1"
      />
      <line
        x1="28"
        y1="88"
        x2="118"
        y2="88"
        className="stroke-muted-foreground/50"
        strokeWidth="1"
      />
      <text
        x="8"
        y="52"
        className="fill-muted-foreground font-sans text-[8px]"
        transform="rotate(-90 8 52)"
      >
        Y
      </text>
      <text x="70" y="102" className="fill-muted-foreground font-sans text-[8px]">
        X
      </text>
    </>
  );

  if (mark === "bar") {
    return (
      <svg viewBox="0 0 130 110" className="h-32 w-full max-w-[200px]">
        {axis}
        <rect x="38" y="48" width="14" height="40" className="fill-primary/70" />
        <rect x="58" y="28" width="14" height="60" className="fill-primary/50" />
        <rect x="78" y="38" width="14" height="50" className="fill-primary/80" />
        <rect x="98" y="58" width="14" height="30" className="fill-primary/40" />
        <text x="100" y="18" className="fill-primary font-sans text-[8px]">
          Color
        </text>
      </svg>
    );
  }

  if (mark === "line" || mark === "area") {
    return (
      <svg viewBox="0 0 130 110" className="h-32 w-full max-w-[200px]">
        {axis}
        {mark === "area" ? (
          <path
            d="M38 70 L58 40 L78 55 L98 30 L118 45 L118 88 L38 88 Z"
            className="fill-primary/25"
          />
        ) : null}
        <polyline
          points="38,70 58,40 78,55 98,30 118,45"
          fill="none"
          className="stroke-primary"
          strokeWidth="2"
        />
        <circle cx="58" cy="40" r="2.5" className="fill-primary" />
        <circle cx="98" cy="30" r="2.5" className="fill-primary" />
        <text x="100" y="18" className="fill-primary font-sans text-[8px]">
          Color
        </text>
      </svg>
    );
  }

  if (mark === "point") {
    return (
      <svg viewBox="0 0 130 110" className="h-32 w-full max-w-[200px]">
        {axis}
        <circle cx="48" cy="60" r="4" className="fill-primary/60" />
        <circle cx="68" cy="35" r="7" className="fill-primary/80" />
        <circle cx="90" cy="50" r="5" className="fill-primary/50" />
        <circle cx="105" cy="28" r="9" className="fill-primary/70" />
        <text x="95" y="18" className="fill-primary font-sans text-[8px]">
          Size / Color
        </text>
      </svg>
    );
  }

  if (mark === "arc") {
    return (
      <svg viewBox="0 0 130 110" className="h-32 w-full max-w-[200px]">
        <path
          d="M65 55 L65 20 A35 35 0 0 1 95 75 Z"
          className="fill-primary/80"
        />
        <path
          d="M65 55 L95 75 A35 35 0 0 1 40 80 Z"
          className="fill-primary/50"
        />
        <path
          d="M65 55 L40 80 A35 35 0 0 1 65 20 Z"
          className="fill-primary/30"
        />
        <text x="88" y="40" className="fill-foreground font-sans text-[8px]">
          Color
        </text>
        <text x="48" y="100" className="fill-muted-foreground font-sans text-[8px]">
          Y = slice size
        </text>
      </svg>
    );
  }

  if (mark === "rect") {
    return (
      <svg viewBox="0 0 130 110" className="h-32 w-full max-w-[200px]">
        {axis}
        <rect x="36" y="24" width="22" height="18" className="fill-primary/30" />
        <rect x="60" y="24" width="22" height="18" className="fill-primary/60" />
        <rect x="84" y="24" width="22" height="18" className="fill-primary/90" />
        <rect x="36" y="44" width="22" height="18" className="fill-primary/50" />
        <rect x="60" y="44" width="22" height="18" className="fill-primary/80" />
        <rect x="84" y="44" width="22" height="18" className="fill-primary/40" />
        <rect x="36" y="64" width="22" height="18" className="fill-primary/70" />
        <rect x="60" y="64" width="22" height="18" className="fill-primary/35" />
        <rect x="84" y="64" width="22" height="18" className="fill-primary/55" />
        <text x="100" y="18" className="fill-primary font-sans text-[8px]">
          Color
        </text>
      </svg>
    );
  }

  return null;
}
