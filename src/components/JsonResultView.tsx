import { useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import type { QueryResult } from "@/types";
import { Button } from "@/components/ui/button";
import {
  editorHighlightExt,
  isDomDark,
} from "@/lib/cmSqlHighlight";
import {
  diffJsonEdits,
  formatResultJson,
} from "@/lib/jsonResultEdit";
import { cn } from "@/lib/utils";

type Props = {
  result: QueryResult;
  hiddenColumns?: string[];
  onCellEdit?: (rowIndex: number, column: string, value: string) => void;
  cellOverride?: (rowIndex: number, column: string) => string | undefined;
};

export function JsonResultView({
  result,
  hiddenColumns = [],
  onCellEdit,
  cellOverride,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const highlightComp = useRef(new Compartment());
  const readOnlyComp = useRef(new Compartment());
  const dirtyRef = useRef(false);
  const propsRef = useRef({ result, hiddenColumns, onCellEdit, cellOverride });
  propsRef.current = { result, hiddenColumns, onCellEdit, cellOverride };
  const editable = !!onCellEdit;
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const baselineText = formatResultJson(result, hiddenColumns, cellOverride);

  function applyFromView(): boolean {
    const view = viewRef.current;
    const p = propsRef.current;
    if (!view || !p.onCellEdit) return false;
    const outcome = diffJsonEdits(
      view.state.doc.toString(),
      p.result,
      p.hiddenColumns,
      p.cellOverride,
    );
    if ("error" in outcome) {
      setError(outcome.error);
      setStatus("");
      return true;
    }
    setError("");
    if (outcome.edits.length === 0) {
      setStatus("No changes");
      dirtyRef.current = false;
      return true;
    }
    for (const e of outcome.edits) {
      p.onCellEdit(e.rowIndex, e.column, e.value);
    }
    setStatus(`Applied ${outcome.edits.length} change(s)`);
    dirtyRef.current = false;
    return true;
  }

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;

    const view = new EditorView({
      doc: formatResultJson(
        propsRef.current.result,
        propsRef.current.hiddenColumns,
        propsRef.current.cellOverride,
      ),
      parent: hostRef.current,
      extensions: [
        basicSetup,
        json(),
        highlightComp.current.of(editorHighlightExt(isDomDark())),
        readOnlyComp.current.of(
          EditorState.readOnly.of(!propsRef.current.onCellEdit),
        ),
        EditorView.theme({
          "&": { fontSize: "11px", height: "100%" },
          ".cm-scroller": {
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
          },
          ".cm-content": { padding: "8px 0" },
          "&.cm-focused": { outline: "none" },
        }),
        EditorView.lineWrapping,
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => applyFromView(),
          },
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            dirtyRef.current = true;
            setError("");
            setStatus("");
          }
        }),
      ],
    });
    viewRef.current = view;

    const themeObs = new MutationObserver(() => {
      view.dispatch({
        effects: highlightComp.current.reconfigure(
          editorHighlightExt(isDomDark()),
        ),
      });
    });
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      themeObs.disconnect();
      view.destroy();
      viewRef.current = null;
    };
    // Mount once; sync via separate effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyComp.current.reconfigure(
        EditorState.readOnly.of(!editable),
      ),
    });
  }, [editable]);

  // Sync from result when not dirty (or when overrides / result change externally).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const next = formatResultJson(result, hiddenColumns, cellOverride);
    if (view.state.doc.toString() === next) return;
    if (
      dirtyRef.current &&
      document.activeElement &&
      view.dom.contains(document.activeElement)
    ) {
      return;
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
    });
    dirtyRef.current = false;
    setError("");
    setStatus("");
  }, [result, hiddenColumns, cellOverride, baselineText]);

  if (result.rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        No rows to show as JSON.
      </div>
    );
  }

  return (
    <div
      data-testid="json-result-view"
      className="flex min-h-0 flex-1 flex-col bg-card/40"
    >
      {editable ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
          <Button size="xs" variant="secondary" onClick={() => applyFromView()}>
            Apply edits
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Ctrl/⌘ + Enter to apply · same row count required
          </span>
          {error ? (
            <span className="ml-auto truncate text-[10px] text-destructive">
              {error}
            </span>
          ) : status ? (
            <span className="ml-auto truncate text-[10px] text-muted-foreground">
              {status}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex shrink-0 items-center border-b border-border px-2 py-1">
          <span className="text-[10px] text-muted-foreground">
            Read-only JSON
          </span>
        </div>
      )}
      <div
        ref={hostRef}
        className={cn("min-h-0 flex-1 overflow-hidden", error && "ring-1 ring-destructive/40")}
      />
    </div>
  );
}
