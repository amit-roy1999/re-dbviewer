import { useRef } from "react";
import { cn } from "@/lib/utils";

type Axis = "x" | "y";

/** Thin drag strip. Calls onDelta with pointer movement in CSS pixels. */
export function ResizeHandle({
  axis,
  onDelta,
  onDragEnd,
  className,
}: {
  axis: Axis;
  onDelta: (delta: number) => void;
  onDragEnd?: () => void;
  className?: string;
}) {
  const last = useRef(0);

  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      tabIndex={0}
      className={cn(
        "shrink-0 bg-transparent transition-colors hover:bg-primary/35 active:bg-primary/50",
        axis === "x"
          ? "w-1 cursor-col-resize"
          : "h-1 cursor-row-resize",
        className,
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        last.current = axis === "x" ? e.clientX : e.clientY;
        document.body.style.cursor =
          axis === "x" ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const cur = axis === "x" ? e.clientX : e.clientY;
        const d = cur - last.current;
        if (d !== 0) {
          last.current = cur;
          onDelta(d);
        }
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        onDragEnd?.();
      }}
      onPointerCancel={() => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        onDragEnd?.();
      }}
    />
  );
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
