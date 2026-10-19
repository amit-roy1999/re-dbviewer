import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { SavedConnection } from "@/types";
import { ensureOpen, listSavedConnections } from "@/lib/dbApi";
import { loadEerModel } from "@/lib/eerModel";
import {
  compareExtras,
  compareSnapshots,
  extrasFromModel,
  snapshotFromModel,
  snapshotFromSql,
  type Diff,
  type Extras,
  type Snapshot,
} from "@/lib/schemaCompare";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BMode = "schema" | "connection" | "file";
const sel =
  "h-7 rounded-lg border border-input bg-transparent px-2 text-xs dark:bg-input/30 dark:[color-scheme:dark]";

export function SchemaCompare({ connection }: { connection: SavedConnection }) {
  const [schemas, setSchemas] = useState<string[]>([]);
  const [schemaA, setSchemaA] = useState<string>("");
  const [mode, setMode] = useState<BMode>("schema");
  const [schemaB, setSchemaB] = useState<string>("");
  const [saved, setSaved] = useState<SavedConnection[]>([]);
  const [connB, setConnB] = useState<string>("");
  const [schemasB, setSchemasB] = useState<string[]>([]);
  const [file, setFile] = useState<string>("");
  const [diffs, setDiffs] = useState<Diff[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadEerModel(connection.id, connection.engine, null, 1)
      .then((r) => {
        setSchemas(r.schemas);
        setSchemaA(r.schemas[0] ?? "");
        setSchemaB(r.schemas[1] ?? r.schemas[0] ?? "");
      })
      .catch((e) => setError(String(e)));
    listSavedConnections()
      .then((l) => setSaved(l.filter((c) => c.id !== connection.id)))
      .catch(() => {});
  }, [connection.id, connection.engine]);

  // schemas of the other connection
  useEffect(() => {
    if (mode !== "connection" || !connB) return;
    const other = saved.find((c) => c.id === connB);
    if (!other) return;
    let dead = false;
    (async () => {
      const done = await ensureOpen(connB, connection.id);
      try {
        const r = await loadEerModel(connB, other.engine, null, 1);
        if (!dead) {
          setSchemasB(r.schemas);
          setSchemaB(r.schemas[0] ?? "");
        }
      } catch (e) {
        if (!dead) setError(String(e));
      } finally {
        await done();
      }
    })();
    return () => {
      dead = true;
    };
  }, [mode, connB, saved, connection.id]);

  async function pickFile() {
    const f = await open({
      multiple: false,
      filters: [{ name: "SQL", extensions: ["sql"] }],
    });
    if (typeof f === "string") setFile(f);
  }

  async function run() {
    setBusy(true);
    setError("");
    setDiffs(null);
    try {
      const modelA = (await loadEerModel(connection.id, connection.engine, schemaA || null, 300)).model;
      const a = snapshotFromModel(modelA);
      let extrasB: Extras | null = null;
      let b: Snapshot;
      if (mode === "schema") {
        const mb = (await loadEerModel(connection.id, connection.engine, schemaB || null, 300)).model;
        b = snapshotFromModel(mb);
        extrasB = extrasFromModel(mb);
      } else if (mode === "connection") {
        const other = saved.find((c) => c.id === connB);
        if (!other) throw new Error("Pick a connection for side B");
        const done = await ensureOpen(connB, connection.id);
        try {
          const mb = (await loadEerModel(connB, other.engine, schemaB || null, 300)).model;
          b = snapshotFromModel(mb);
          extrasB = extrasFromModel(mb);
        } finally {
          await done();
        }
      } else {
        if (!file) throw new Error("Pick a .sql file for side B");
        b = snapshotFromSql(await invoke<string>("read_text_file", { path: file }));
      }
      setDiffs([
        ...compareSnapshots(a, b),
        ...(extrasB ? compareExtras(extrasFromModel(modelA), extrasB) : []),
      ]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const schemaSelect = (v: string, set: (s: string) => void, list: string[]) => (
    <select className={sel} value={v} onChange={(e) => set(e.target.value)}>
      <option value="">All</option>
      {list.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-md border border-border p-2.5">
          <span className="text-xs font-medium">A — {connection.name}</span>
          <div className="flex items-center gap-2 text-xs">
            schema {schemaSelect(schemaA, setSchemaA, schemas)}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 rounded-md border border-border p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            B —
            {(["schema", "connection", "file"] as BMode[]).map((m) => (
              <Button
                key={m}
                size="xs"
                variant={mode === m ? "default" : "outline"}
                onClick={() => setMode(m)}
              >
                {m === "schema" ? "other schema" : m === "connection" ? "other connection" : "SQL file"}
              </Button>
            ))}
          </div>
          {mode === "schema" ? (
            <div className="flex items-center gap-2 text-xs">
              schema {schemaSelect(schemaB, setSchemaB, schemas)}
            </div>
          ) : null}
          {mode === "connection" ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select className={sel} value={connB} onChange={(e) => setConnB(e.target.value)}>
                <option value="">Pick…</option>
                {saved.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.engine})
                  </option>
                ))}
              </select>
              schema {schemaSelect(schemaB, setSchemaB, schemasB)}
            </div>
          ) : null}
          {mode === "file" ? (
            <div className="flex items-center gap-2 text-xs">
              <Button size="xs" variant="outline" onClick={() => void pickFile()}>
                Browse…
              </Button>
              <span className="truncate font-mono">{file || "no file"}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => void run()}>
          {busy ? "Comparing…" : "Compare"}
        </Button>
        {diffs ? (
          <span className="text-xs text-muted-foreground">
            {diffs.length === 0 ? "Schemas match." : `${diffs.length} differences`}
          </span>
        ) : null}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {diffs && diffs.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Difference</TableHead>
                <TableHead className="text-xs">Table</TableHead>
                <TableHead className="text-xs">Column</TableHead>
                <TableHead className="text-xs">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diffs.map((d, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Badge variant={d.kind.includes("type") || /^(index|fk)/.test(d.kind) ? "outline" : "secondary"} className="text-[10px]">
                      {d.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{d.table}</TableCell>
                  <TableCell className="font-mono text-xs">{d.column ?? ""}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{d.detail ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
