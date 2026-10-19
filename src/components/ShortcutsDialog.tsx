import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS: [keys: string, what: string][] = [
  ["Ctrl/⌘ + T", "New query tab"],
  ["Ctrl/⌘ + W", "Close tab"],
  ["Ctrl/⌘ + O", "Open SQL file"],
  ["Ctrl/⌘ + S", "Save SQL file"],
  ["Ctrl/⌘ + Shift + S", "Save SQL file as…"],
  ["Ctrl/⌘ + Shift + F", "Format SQL"],
  ["Ctrl/⌘ + Shift + H", "Search data in tables"],
  ["Ctrl/⌘ + Enter", "Run selection / current statement"],
  ["Ctrl/⌘ + Shift + Enter", "Run script (all statements)"],
  ["Ctrl/⌘ + F", "Find / replace in the editor"],
  ["Ctrl/⌘ + Shift + N", "New window"],
  ["Ctrl/⌘ + Shift + Q", "Disconnect"],
  ["Ctrl/⌘ + ,", "Preferences"],
  ["Ctrl/⌘ + +", "Zoom in (whole app)"],
  ["Ctrl/⌘ + -", "Zoom out (whole app)"],
  ["Ctrl/⌘ + 0", "Reset zoom to 100%"],
];

export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="contents">
              <dt className="font-mono text-muted-foreground">{keys}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
