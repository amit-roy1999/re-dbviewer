import { cn } from "@/lib/utils";

/** App mark (replaces the old "re" text badge). */
export function AppLogo({
  className,
  title = "re-dbviewer",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={cn("size-5 shrink-0 rounded-sm", className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect width="32" height="32" rx="7" fill="#0f766e" />
      <path
        fill="#f0fdfa"
        d="M8 8h16a1.5 1.5 0 0 1 1.5 1.5V11H6.5V9.5A1.5 1.5 0 0 1 8 8Zm-1.5 5H14v3.5H6.5V13Zm0 5.5H14V22H8A1.5 1.5 0 0 1 6.5 20.5V18.5Zm9.5-5.5h9.5v3.5H16V13Zm0 5.5h5.25V22H16v-3.5Z"
      />
      <path fill="#5eead4" d="M23.25 18.5 26.5 22.25 23.25 24.5V18.5Z" />
    </svg>
  );
}
