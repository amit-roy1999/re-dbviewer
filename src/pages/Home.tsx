import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  MoreHorizontal,
  Plus,
  Database,
  Star,
  FolderOpen,
} from "lucide-react";
import type {
  Category,
  ConnectionConfig,
  Engine,
  Permissions,
  SavedConnection,
} from "@/types";
import {
  FULL_PERMISSIONS,
  connectionSummary,
  isRestricted,
} from "@/types";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  buildConnectionUrl,
  parseConnectionUrl,
} from "@/lib/connectionUrl";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Props = {
  onOpen: (conn: SavedConnection) => void;
};

type Draft = {
  id?: string;
  name: string;
  engine: Engine;
  categoryId: string | null;
  isFavorite: boolean;
  accentColor: string;
  url: string;
  config: ConnectionConfig;
  permissions: Permissions;
};

const ENGINES: { id: Engine; label: string; defaultPort?: number }[] = [
  { id: "sqlite", label: "SQLite" },
  { id: "postgres", label: "PostgreSQL", defaultPort: 5432 },
  { id: "mysql", label: "MySQL", defaultPort: 3306 },
  { id: "mariadb", label: "MariaDB", defaultPort: 3306 },
  { id: "mssql", label: "SQL Server", defaultPort: 1433 },
];

function emptyDraft(): Draft {
  const engine: Engine = "sqlite";
  const config: ConnectionConfig = { path: "" };
  return {
    name: "",
    engine,
    categoryId: null,
    isFavorite: false,
    accentColor: DEFAULT_ACCENT,
    url: buildConnectionUrl(engine, config),
    config,
    permissions: { ...FULL_PERMISSIONS },
  };
}

function fromSaved(c: SavedConnection): Draft {
  const engine = c.engine as Engine;
  const config = { ...c.config };
  return {
    id: c.id,
    name: c.name,
    engine,
    categoryId: c.categoryId,
    isFavorite: c.isFavorite,
    accentColor: c.accentColor || DEFAULT_ACCENT,
    url: buildConnectionUrl(engine, config),
    config,
    permissions: { ...c.permissions },
  };
}

function syncUrl(d: Draft): Draft {
  return { ...d, url: buildConnectionUrl(d.engine, d.config) };
}

export default function Home({ onOpen }: Props) {
  const [list, setList] = useState<SavedConnection[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCat, setFilterCat] = useState<string | "all" | "none">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [catDialog, setCatDialog] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [conns, cats] = await Promise.all([
      invoke<SavedConnection[]>("list_connections"),
      invoke<Category[]>("list_categories"),
    ]);
    setList(conns);
    setCategories(cats);
  }

  useEffect(() => {
    reload().catch((e) => setError(String(e)));
  }, []);

  const favorites = useMemo(() => list.filter((c) => c.isFavorite), [list]);
  const library = useMemo(() => {
    if (filterCat === "all") return list;
    if (filterCat === "none") return list.filter((c) => !c.categoryId);
    return list.filter((c) => c.categoryId === filterCat);
  }, [list, filterCat]);

  async function pickFile() {
    const file = await open({
      multiple: false,
      filters: [{ name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] }],
    });
    if (typeof file === "string" && draft) {
      setDraft(
        syncUrl({ ...draft, config: { ...draft.config, path: file } }),
      );
    }
  }

  function applyUrl(raw: string) {
    if (!draft) return;
    try {
      const parsed = parseConnectionUrl(raw);
      setDraft({
        ...draft,
        engine: parsed.engine,
        config: parsed.config,
        url: raw.trim(),
      });
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  function setEngine(engine: Engine) {
    if (!draft) return;
    const meta = ENGINES.find((e) => e.id === engine);
    if (engine === "sqlite") {
      setDraft(
        syncUrl({
          ...draft,
          engine,
          config: { path: draft.config.path ?? "" },
        }),
      );
    } else {
      setDraft(
        syncUrl({
          ...draft,
          engine,
          config: {
            host: draft.config.host ?? "127.0.0.1",
            port: draft.config.port ?? meta?.defaultPort ?? 5432,
            user: draft.config.user ?? "",
            password: draft.config.password ?? "",
            database: draft.config.database ?? "",
          },
        }),
      );
    }
  }

  async function saveDraft() {
    if (!draft?.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (draft.engine === "sqlite" && !draft.config.path?.trim()) {
      setError("SQLite path is required.");
      return;
    }
    if (draft.engine !== "sqlite" && !draft.config.host?.trim()) {
      setError("Host is required (or paste a connection URL).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: draft.name.trim(),
        engine: draft.engine,
        categoryId: draft.categoryId,
        isFavorite: draft.isFavorite,
        accentColor: draft.accentColor,
        config: draft.config,
        permissions: draft.permissions,
      };
      if (draft.id) {
        await invoke("update_connection", { id: draft.id, ...payload });
      } else {
        await invoke("save_connection", payload);
      }
      setDraft(null);
      setStatus("Connection saved.");
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function testDraft() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      setStatus(
        await invoke<string>("test_connection", {
          engine: draft.engine,
          config: draft.config,
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openConn(id: string) {
    setBusy(true);
    setError("");
    try {
      onOpen(await invoke<SavedConnection>("open_connection", { id }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await invoke("delete_connection", { id });
      setStatus("Connection deleted.");
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(c: SavedConnection) {
    setBusy(true);
    try {
      await invoke("set_favorite", { id: c.id, isFavorite: !c.isFavorite });
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addCategory() {
    if (!newCatName.trim()) return;
    setBusy(true);
    try {
      await invoke("save_category", { name: newCatName.trim() });
      setNewCatName("");
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(id: string) {
    setBusy(true);
    try {
      await invoke("delete_category", { id });
      if (filterCat === id) setFilterCat("all");
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function ConnCard({ c }: { c: SavedConnection }) {
    const accent = c.accentColor || DEFAULT_ACCENT;
    return (
      <Card
        className="overflow-hidden py-3"
        style={{ borderLeftWidth: 4, borderLeftColor: accent }}
      >
        <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-0">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database
                className="size-4 shrink-0"
                style={{ color: accent }}
              />
              <span className="truncate">{c.name}</span>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {c.engine}
              </Badge>
              {c.isFavorite ? (
                <Star className="size-3.5 fill-amber-400 text-amber-400" />
              ) : null}
              {isRestricted(c.permissions) ? (
                <Badge variant="outline" className="text-[10px]">
                  restricted
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription className="truncate font-mono text-xs">
              {c.categoryName ? `${c.categoryName} · ` : ""}
              {connectionSummary(c)}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" disabled={busy} onClick={() => openConn(c.id)}>
              Open
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="outline" disabled={busy}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => toggleFavorite(c)}>
                  {c.isFavorite ? "Unfavorite" : "Favorite"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      setStatus(
                        await invoke<string>("test_connection", {
                          engine: c.engine,
                          config: c.config,
                        }),
                      );
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  Test connection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDraft(fromSaved(c))}>
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => remove(c.id)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-5 overflow-auto p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">re-dbviewer</h1>
          <p className="text-sm text-muted-foreground">
            Favorites, categories, and multi-engine connections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setCatDialog(true)}
          >
            <FolderOpen className="size-4" />
            Categories
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setError("");
              setDraft(emptyDraft());
            }}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {status && !error ? (
        <Alert>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}

      {favorites.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Favorites
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {favorites.map((c) => (
              <ConnCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-medium text-muted-foreground">
            Library
          </h2>
          <Button
            size="sm"
            variant={filterCat === "all" ? "default" : "outline"}
            onClick={() => setFilterCat("all")}
          >
            All
          </Button>
          <Button
            size="sm"
            variant={filterCat === "none" ? "default" : "outline"}
            onClick={() => setFilterCat("none")}
          >
            Uncategorized
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              size="sm"
              variant={filterCat === cat.id ? "default" : "outline"}
              onClick={() => setFilterCat(cat.id)}
            >
              {cat.name}
            </Button>
          ))}
        </div>
        <ul className="flex flex-col gap-2">
          {library.map((c) => (
            <li key={c.id}>
              <ConnCard c={c} />
            </li>
          ))}
          {library.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connections here.</p>
          ) : null}
        </ul>
      </section>

      <Dialog open={draft != null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? "Edit connection" : "New connection"}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="flex flex-col gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="conn-name">Name</Label>
                <Input
                  id="conn-name"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft({ ...draft, name: e.target.value })
                  }
                  placeholder="My database"
                />
              </div>

              <div className="grid gap-1.5">
                <Label>Engine</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ENGINES.map((e) => (
                    <Button
                      key={e.id}
                      type="button"
                      size="sm"
                      variant={draft.engine === e.id ? "default" : "outline"}
                      onClick={() => setEngine(e.id)}
                    >
                      {e.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="conn-url">Connection URL</Label>
                <Input
                  id="conn-url"
                  className="font-mono text-xs"
                  value={draft.url}
                  onChange={(e) =>
                    setDraft({ ...draft, url: e.target.value })
                  }
                  onBlur={(e) => {
                    if (e.target.value.trim()) applyUrl(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyUrl(draft.url);
                    }
                  }}
                  placeholder="postgresql://user:pass@host:5432/dbname"
                />
                <p className="text-[11px] text-muted-foreground">
                  Paste a URL and press Enter / blur to fill fields. Supports
                  postgresql, mysql, mariadb, mssql, sqlite.
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label>Accent color</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {ACCENT_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={color}
                      className="size-6 rounded-full border-2"
                      style={{
                        backgroundColor: color,
                        borderColor:
                          draft.accentColor === color
                            ? "var(--foreground)"
                            : "transparent",
                      }}
                      onClick={() =>
                        setDraft({ ...draft, accentColor: color })
                      }
                    />
                  ))}
                  <Input
                    type="color"
                    className="h-8 w-12 cursor-pointer p-1"
                    value={draft.accentColor}
                    onChange={(e) =>
                      setDraft({ ...draft, accentColor: e.target.value })
                    }
                  />
                </div>
              </div>

              {draft.engine === "sqlite" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="conn-path">SQLite path</Label>
                  <div className="flex gap-2">
                    <Input
                      id="conn-path"
                      className="font-mono text-xs"
                      value={draft.config.path ?? ""}
                      onChange={(e) =>
                        setDraft(
                          syncUrl({
                            ...draft,
                            config: { ...draft.config, path: e.target.value },
                          }),
                        )
                      }
                      placeholder="/path/to/file.sqlite"
                    />
                    <Button type="button" variant="outline" onClick={pickFile}>
                      Browse
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label>Host</Label>
                    <Input
                      value={draft.config.host ?? ""}
                      onChange={(e) =>
                        setDraft(
                          syncUrl({
                            ...draft,
                            config: { ...draft.config, host: e.target.value },
                          }),
                        )
                      }
                      placeholder="127.0.0.1"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Port</Label>
                    <Input
                      type="number"
                      value={draft.config.port ?? ""}
                      onChange={(e) =>
                        setDraft(
                          syncUrl({
                            ...draft,
                            config: {
                              ...draft.config,
                              port: e.target.value
                                ? Number(e.target.value)
                                : null,
                            },
                          }),
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Database</Label>
                    <Input
                      value={draft.config.database ?? ""}
                      onChange={(e) =>
                        setDraft(
                          syncUrl({
                            ...draft,
                            config: {
                              ...draft.config,
                              database: e.target.value,
                            },
                          }),
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>User</Label>
                    <Input
                      value={draft.config.user ?? ""}
                      onChange={(e) =>
                        setDraft(
                          syncUrl({
                            ...draft,
                            config: { ...draft.config, user: e.target.value },
                          }),
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={draft.config.password ?? ""}
                      onChange={(e) =>
                        setDraft(
                          syncUrl({
                            ...draft,
                            config: {
                              ...draft.config,
                              password: e.target.value,
                            },
                          }),
                        )
                      }
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="conn-category">Category</Label>
                <select
                  id="conn-category"
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:[color-scheme:dark]"
                  value={draft.categoryId ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      categoryId: e.target.value || null,
                    })
                  }
                >
                  <option value="" className="bg-popover text-popover-foreground">
                    Uncategorized
                  </option>
                  {categories.map((cat) => (
                    <option
                      key={cat.id}
                      value={cat.id}
                      className="bg-popover text-popover-foreground"
                    >
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isFavorite}
                  onChange={(e) =>
                    setDraft({ ...draft, isFavorite: e.target.checked })
                  }
                />
                Favorite
              </label>

              <div className="grid gap-1.5">
                <Label>Allowed actions</Label>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  {(
                    [
                      ["allowSelect", "SELECT / read"],
                      ["allowInsert", "INSERT"],
                      ["allowUpdate", "UPDATE"],
                      ["allowDelete", "DELETE"],
                      ["allowDdl", "DDL"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.permissions[key]}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            permissions: {
                              ...draft.permissions,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={testDraft}
            >
              Test
            </Button>
            <Button type="button" disabled={busy} onClick={saveDraft}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Categories</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              placeholder="New category name"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
            />
            <Button disabled={busy} onClick={addCategory}>
              Add
            </Button>
          </div>
          <ul className="flex flex-col gap-1">
            {categories.map((cat) => (
              <li
                key={cat.id}
                className="flex items-center justify-between rounded border px-3 py-2 text-sm"
              >
                <span>{cat.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => removeCategory(cat.id)}
                >
                  Delete
                </Button>
              </li>
            ))}
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No categories yet.</p>
            ) : null}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
