import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PromptRequest = {
  title: string;
  description?: string;
  label: string;
  initial?: string;
  confirmLabel: string;
  onSubmit: (value: string) => void | Promise<void>;
};

export function PromptDialog({
  request,
  onClose,
}: {
  request: PromptRequest | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (request) setValue(request.initial ?? "");
  }, [request]);

  function submit() {
    if (!request || !value.trim()) return;
    const r = request;
    onClose();
    void r.onSubmit(value.trim());
  }

  return (
    <Dialog open={request != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          {request?.description ? (
            <DialogDescription>{request.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">{request?.label}</span>
          <Input
            autoFocus
            className="font-mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!value.trim()} onClick={submit}>
            {request?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
