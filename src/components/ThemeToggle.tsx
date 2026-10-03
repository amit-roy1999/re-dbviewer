import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applyTheme,
  getStoredTheme,
  toggleTheme,
  type Theme,
} from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const t = getStoredTheme();
    applyTheme(t);
    setTheme(t);
  }, []);

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(toggleTheme())}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
