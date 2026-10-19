import { Button } from "@/components/ui/button";

/** E6: toggle queued cell edits; shows "Apply N changes" while edits are pending. */
export function BatchEditBar({
  enabled,
  onToggle,
  count,
  busy,
  onApply,
  onDiscard,
}: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  count: number;
  busy: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1 text-[11px]">
      <label
        className="flex items-center gap-1.5 text-muted-foreground"
        title="Queue cell edits and apply them together in one transaction"
      >
        <input
          type="checkbox"
          className="size-3.5 accent-primary"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        Batch edits
      </label>
      {count > 0 ? (
        <>
          <Button size="xs" disabled={busy} onClick={onApply}>
            Apply {count} change{count === 1 ? "" : "s"}
          </Button>
          <Button size="xs" variant="outline" disabled={busy} onClick={onDiscard}>
            Discard
          </Button>
        </>
      ) : null}
    </div>
  );
}
