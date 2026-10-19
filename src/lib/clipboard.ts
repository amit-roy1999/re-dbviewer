import { invoke } from "@tauri-apps/api/core";
import type { EditorView } from "codemirror";
import { redo, undo } from "@codemirror/commands";

/** Write text to the system clipboard (native first, browser as fallback). */
export async function copyText(text: string): Promise<void> {
  try {
    await invoke("write_clipboard", { text });
  } catch {
    await navigator.clipboard.writeText(text);
  }
}

export async function readText(): Promise<string> {
  try {
    return await invoke<string>("read_clipboard");
  } catch {
    return navigator.clipboard.readText();
  }
}

// ---- Edit menu: act on the last focused editable --------------------------
// Opening a menu steals focus, so remember the last editable element and the
// CodeMirror view (if any) instead of reading document.activeElement.

type Editable = HTMLInputElement | HTMLTextAreaElement;

let lastEl: HTMLElement | null = null;
// One CodeMirror view per mounted workspace; returns an unregister function.
const editors = new Set<EditorView>();

export function registerEditor(view: EditorView): () => void {
  editors.add(view);
  return () => {
    editors.delete(view);
  };
}

/** The editor the user was last typing in (or the first visible one). */
function activeEditor(): EditorView | null {
  const all = [...editors];
  return (
    all.find((v) => lastEl != null && v.dom.contains(lastEl)) ??
    all.find((v) => v.dom.offsetParent !== null) ??
    null
  );
}

function isEditable(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el.isContentEditable
  );
}

let tracking = false;
export function trackEditFocus() {
  if (tracking) return;
  tracking = true;
  document.addEventListener("focusin", (e) => {
    if (isEditable(e.target)) lastEl = e.target;
  });
}

function cmFocused(): EditorView | null {
  const v = activeEditor();
  return v && lastEl != null && v.dom.contains(lastEl) ? v : null;
}

function selectedText(): string {
  const editor = cmFocused();
  if (editor) {
    const r = editor.state.selection.main;
    return editor.state.sliceDoc(r.from, r.to);
  }
  if (lastEl instanceof HTMLInputElement || lastEl instanceof HTMLTextAreaElement) {
    const el: Editable = lastEl;
    return el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
  }
  return window.getSelection()?.toString() ?? "";
}

function replaceSelection(text: string) {
  const editor = cmFocused();
  if (editor) {
    editor.dispatch(editor.state.replaceSelection(text));
    editor.focus();
    return;
  }
  const el = lastEl;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    el.focus();
    el.setSelectionRange(start, end);
    // insertText fires a real `input` event, so React state stays in sync.
    document.execCommand("insertText", false, text);
  }
}

export async function editCopy() {
  const t = selectedText();
  if (t) await copyText(t);
}

export async function editCut() {
  const t = selectedText();
  if (!t) return;
  await copyText(t);
  replaceSelection("");
}

export async function editPaste() {
  const el = lastEl;
  if (!cmFocused() && !(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
    return;
  }
  const t = await readText();
  if (t) replaceSelection(t);
}

export function editUndo() {
  const editor = activeEditor();
  if (editor) {
    editor.focus();
    undo(editor);
  }
}

export function editRedo() {
  const editor = activeEditor();
  if (editor) {
    editor.focus();
    redo(editor);
  }
}
