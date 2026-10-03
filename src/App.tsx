import { useState } from "react";
import Home from "@/pages/Home";
import Workspace from "@/pages/Workspace";
import type { SavedConnection } from "@/types";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  const [open, setOpen] = useState<SavedConnection | null>(null);

  return (
    <TooltipProvider>
      <div className="h-full min-h-0 bg-background text-foreground">
        {open ? (
          <Workspace connection={open} onBack={() => setOpen(null)} />
        ) : (
          <Home onOpen={setOpen} />
        )}
      </div>
    </TooltipProvider>
  );
}
