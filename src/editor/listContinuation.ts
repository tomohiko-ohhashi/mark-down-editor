import { EditorSelection, type StateCommand } from "@codemirror/state";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { deleteMarkupBackward } from "@codemirror/lang-markdown";

/** Parsed prefix of a list / quote / task line. */
export interface LinePrefix {
  indent: string;
  /** e.g. "- ", "1. ", "> ", "> - ", "- [ ] " */
  marker: string;
  /** Text after the marker. */
  rest: string;
  /** How many characters of the line the indent and the marker take, as written. */
  length: number;
}

// A list marker counts only when a space (or the end of the line) follows it, as in Markdown itself:
// "**bold** at the start", "-5", "1.5" and "+1" are ordinary text.
const PREFIX_RE = /^(\s*)((?:>\s*)*)((?:[-*+]|\d{1,9}[.)])(?=\s|$))?(\s+\[[ xX]\](?=\s|$))?\s*/;
/** A thematic break ("---", "* * *"): not a list item. */
const RULE_RE = /^\s*(?:>\s*)*([-*_])(?:\s*\1){2,}\s*$/;

export function parseLinePrefix(text: string): LinePrefix | null {
  if (RULE_RE.test(text)) return null;
  const m = PREFIX_RE.exec(text);
  if (!m) return null;
  const [all, indent, quotes, bullet, task] = m;
  if (!quotes && !bullet) return null;
  let marker = quotes ? quotes.replace(/>\s*/g, "> ") : "";
  if (bullet) marker += bullet + (task ? " [ ]" : "") + " ";
  return { indent, marker, rest: text.slice(all.length), length: all.length };
}

/**
 * Text to insert after the newline to continue the list/quote on `line`,
 * or "" when the line is an empty item (which means: leave the list).
 */
export function continuationFor(text: string): { insert: string; exitList: boolean } | null {
  const p = parseLinePrefix(text);
  if (!p) return null;
  if (p.rest.trim() === "") return { insert: "", exitList: true };
  const next = p.marker.replace(/(\d+)([.)])/, (_m, n: string, d: string) => `${Number(n) + 1}${d}`);
  return { insert: p.indent + next, exitList: false };
}

/** Continue the list / quote on the current line (Enter in "enter" mode, Shift+Enter in "shift" mode). */
export const continueList: StateCommand = ({ state, dispatch }) => {
  const { head, from, to } = state.selection.main;
  if (from !== to) return false;
  const line = state.doc.lineAt(head);
  const c = continuationFor(line.text);
  if (!c) return false;
  const p = parseLinePrefix(line.text)!;
  // The cursor is in front of (or inside) the marker: an ordinary line break. Adding a marker
  // there would put it before the existing one ("- - item").
  if (head < line.from + p.length) return false;
  if (c.exitList) {
    // Empty item: remove the marker instead of adding another one.
    dispatch(
      state.update({
        changes: { from: line.from + p.indent.length, to: line.to, insert: "" },
        selection: EditorSelection.cursor(line.from + p.indent.length),
        userEvent: "delete",
      }),
    );
    return true;
  }
  const insert = "\n" + c.insert;
  dispatch(
    state.update({
      changes: { from: head, to: head, insert },
      selection: EditorSelection.cursor(head + insert.length),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

/** Plain newline that never continues a list. */
export const plainNewline: StateCommand = ({ state, dispatch }) => {
  const { head } = state.selection.main;
  const line = state.doc.lineAt(head);
  const indent = /^\s*/.exec(line.text)?.[0] ?? "";
  const insert = "\n" + indent;
  dispatch(
    state.update({
      changes: { from: state.selection.main.from, to: state.selection.main.to, insert },
      selection: EditorSelection.cursor(state.selection.main.from + insert.length),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

export function listKeymap(mode: "shift" | "enter" | "off") {
  // Backspace right after a list marker removes the marker (from lang-markdown).
  const backspace = { key: "Backspace", run: deleteMarkupBackward };
  if (mode === "off") return [backspace];
  if (mode === "enter") {
    return [backspace, { key: "Enter", run: continueList }, { key: "Shift-Enter", run: plainNewline }];
  }
  return [backspace, { key: "Shift-Enter", run: continueList }, { key: "Enter", run: insertNewlineAndIndent }];
}
