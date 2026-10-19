import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type InspectorData = {
  table: string;
  kind: string;
  loading: boolean;
  rowCount: number | null;
  columnCount: number | null;
  indexCount: number | null;
  fkCount: number | null;
  createSql: string;
  schemaSummary: string;
  error?: string;
};

export function TableInspectorDialog({
  data,
  onClose,
  onOpenInQuery,
}: {
  data: InspectorData | null;
  onClose: () => void;
  onOpenInQuery: (sql: string) => void;
}) {
  const stat = (label: string, v: number | null) => (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="font-mono text-sm">{v ?? "…"}</div>
    </div>
  );
  return (
    <Dialog open={data != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Inspector · <span className="font-mono">{data?.table}</span>
            {data?.loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
          </DialogTitle>
        </DialogHeader>
        {data ? (
          <div className="space-y-3 text-xs">
            <div className="text-muted-foreground">
              {data.kind} · {data.schemaSummary}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {stat("Rows", data.rowCount)}
              {stat("Columns", data.columnCount)}
              {stat("Indexes", data.indexCount)}
              {stat("Foreign keys", data.fkCount)}
            </div>
            {data.error ? (
              <div className="text-destructive">{data.error}</div>
            ) : null}
            <div>
              <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                CREATE SQL
              </div>
              <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-[11px] whitespace-pre-wrap">
                {data.createSql || (data.loading ? "Loading…" : "—")}
              </pre>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={!data.createSql}
                onClick={() => {
                  onOpenInQuery(data.createSql);
                  onClose();
                }}
              >
                Open SQL in Query
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
