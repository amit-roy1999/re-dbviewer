import {
  HighlightStyle,
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** High-contrast SQL highlighting for dark editor chrome. */
const darkSqlHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "#d4a5ff" },
  { tag: t.operator, color: "#89ddff" },
  { tag: t.string, color: "#c3e88d" },
  { tag: t.special(t.string), color: "#c3e88d" },
  { tag: t.number, color: "#f78c6c" },
  { tag: t.integer, color: "#f78c6c" },
  { tag: t.float, color: "#f78c6c" },
  { tag: t.bool, color: "#f78c6c" },
  { tag: t.null, color: "#f78c6c" },
  { tag: t.atom, color: "#f78c6c" },
  { tag: t.comment, color: "#8b9bb4", fontStyle: "italic" },
  { tag: t.typeName, color: "#ffcb6b" },
  { tag: t.className, color: "#ffcb6b" },
  { tag: t.labelName, color: "#ffcb6b" },
  { tag: t.name, color: "#e8eef3" },
  { tag: t.variableName, color: "#e8eef3" },
  { tag: t.propertyName, color: "#82aaff" },
  { tag: t.punctuation, color: "#a8b4c4" },
  { tag: t.paren, color: "#e8eef3" },
  { tag: t.squareBracket, color: "#e8eef3" },
  { tag: t.brace, color: "#e8eef3" },
  { tag: t.meta, color: "#89ddff" },
]);

export function isDomDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

/** Non-fallback style so it beats basicSetup's light defaultHighlightStyle. */
export function sqlHighlightExt(dark = isDomDark()) {
  return dark
    ? syntaxHighlighting(darkSqlHighlight)
    : syntaxHighlighting(defaultHighlightStyle);
}

/** Same highlight styles work for JSON (property / string / number / null tags). */
export const editorHighlightExt = sqlHighlightExt;
