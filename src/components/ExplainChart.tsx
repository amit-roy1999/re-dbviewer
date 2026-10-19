import type { ExplainStep } from "@/lib/explainSql";

type Props = {
  steps: ExplainStep[];
  accent?: string;
};

export function ExplainChart({ steps, accent = "#0f766e" }: Props) {
  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
        No plan steps to chart.
      </div>
    );
  }

  const max = Math.max(1, ...steps.map((s) => s.value));
  const metric = steps[0]?.metric ?? "value";

  return (
    <div className="px-3 py-3">
      <p className="mb-2 text-[11px] text-muted-foreground">
        Plan steps by {metric} (top {steps.length})
      </p>
      <ul className="flex flex-col gap-2.5">
        {steps.map((s, i) => {
          const pct = Math.max(3, (s.value / max) * 100);
          return (
            <li
              key={`${s.label}-${i}`}
              className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-2"
            >
              <div className="min-w-0">
                <div
                  className="mb-0.5 truncate font-mono text-[11px] text-foreground"
                  title={s.label}
                >
                  {s.label}
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-sm bg-muted">
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: accent,
                      minWidth: 4,
                    }}
                  />
                </div>
              </div>
              <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                {Number.isInteger(s.value) ? s.value : s.value.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
