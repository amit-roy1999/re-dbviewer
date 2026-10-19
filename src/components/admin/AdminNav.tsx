import { ADMIN_NAV, type AdminViewId } from "@/lib/adminNav";
import { cn } from "@/lib/utils";

export function AdminNav({
  active,
  onSelect,
}: {
  active: AdminViewId;
  onSelect: (id: AdminViewId) => void;
}) {
  return (
    <nav
      data-testid="admin-nav"
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1.5 pb-2"
    >
      {ADMIN_NAV.map((group) => (
        <div key={group.id}>
          <div className="px-2 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {group.label}
          </div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  data-testid={`admin-view-${item.id}`}
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left text-xs",
                    active === item.id
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-muted/80",
                  )}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
