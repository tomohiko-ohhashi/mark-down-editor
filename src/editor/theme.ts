import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** Colours come from CSS variables so the editor follows the app theme. */
export const baseTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--bg)",
    color: "var(--fg)",
    fontSize: "var(--editor-font-size)",
  },
  ".cm-scroller": {
    fontFamily: "var(--mono)",
    lineHeight: "1.7",
    overflow: "auto",
  },
  ".cm-content": { padding: "16px 0", caretColor: "var(--fg)" },
  ".cm-line": { padding: "0 24px" },
  ".cm-gutters": {
    backgroundColor: "var(--bg)",
    color: "var(--fg-muted)",
    border: "none",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--fg)" },
  ".cm-activeLine": { backgroundColor: "var(--line-highlight)" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--fg)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--selection) !important",
  },
  ".cm-panels": { backgroundColor: "var(--bg-alt)", color: "var(--fg)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-searchMatch": { backgroundColor: "var(--search-match)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--search-match-selected)" },
  ".cm-panel input, .cm-panel button": {
    backgroundColor: "var(--bg)",
    color: "var(--fg)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
  },
  // The search panel's default controls are tiny; make them readable and easy to hit.
  ".cm-panel.cm-search": { padding: "8px 10px", fontFamily: "var(--sans)", fontSize: "13px", lineHeight: "2.1" },
  ".cm-panel.cm-search input.cm-textfield": { fontSize: "13px", padding: "4px 8px", width: "min(16em, calc(100% - 34px))", margin: "0 6px 0 0", boxSizing: "border-box" },
  ".cm-panel.cm-search button.cm-button": {
    fontSize: "12.5px",
    padding: "4px 10px",
    margin: "0 6px 0 0",
    backgroundImage: "none",
    cursor: "pointer",
  },
  ".cm-panel.cm-search label": { fontSize: "12.5px", margin: "0 10px 0 0", whiteSpace: "nowrap" },
  ".cm-panel.cm-search button[name=close]": { fontSize: "18px", padding: "0 8px", border: "none", backgroundColor: "transparent", cursor: "pointer" },
});

export const markdownHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading, color: "var(--accent)", fontWeight: "bold" },
    { tag: t.heading1, fontSize: "1.4em" },
    { tag: t.heading2, fontSize: "1.25em" },
    { tag: t.heading3, fontSize: "1.1em" },
    { tag: t.strong, fontWeight: "bold" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.link, color: "var(--link)", textDecoration: "underline" },
    { tag: t.url, color: "var(--link)" },
    { tag: t.monospace, color: "var(--code)" },
    { tag: t.quote, color: "var(--fg-muted)", fontStyle: "italic" },
    { tag: t.list, color: "var(--accent)" },
    { tag: t.processingInstruction, color: "var(--fg-muted)" },
    { tag: t.meta, color: "var(--fg-muted)" },
    { tag: t.contentSeparator, color: "var(--fg-muted)" },
    { tag: t.keyword, color: "var(--syntax-keyword)" },
    { tag: t.string, color: "var(--syntax-string)" },
    { tag: t.comment, color: "var(--fg-muted)", fontStyle: "italic" },
    { tag: [t.number, t.bool], color: "var(--syntax-number)" },
    { tag: [t.function(t.variableName), t.definition(t.variableName)], color: "var(--syntax-function)" },
  ]),
);
