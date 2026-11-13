import { EditorSelection, type StateCommand } from "@codemirror/state";
import { deleteMarkupBackward } from "@codemirror/lang-markdown";
import { inCodeBlock } from "./context";

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
  if (from !== to || state.selection.ranges.length > 1) return false;
  const line = state.doc.lineAt(head);
  const c = continuationFor(line.text);
  if (!c) return false;
  // In a code block "- old" or "> out" is code (a diff, a shell prompt), not a list.
  if (inCodeBlock(state, line.from)) return false;
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

/**
 * A line break that keeps the indentation of the line, exactly as it is written (tabs stay tabs).
 * This is the editor's Enter. The library's own one works out an indentation from the language of
 * the text around the cursor: it indented after "<div>" (far enough, and the next paragraph became
 * a code block), turned tabs into spaces, deleted spaces after the cursor (the two spaces of a
 * hard line break) and put two line breaks between "(" and ")".
 */
export const plainNewline: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const indent = /^[ \t]*/.exec(line.text.slice(0, range.from - line.from))?.[0] ?? "";
    const insert = "\n" + indent;
    return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(range.from + insert.length) };
  });
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

const ITEM_RE = /^([ \t]*)(?:[-*+]|(\d{1,9})[.)])(?:[ \t]+|$)/;

/** A numbered item that changes level gets the number that fits there: one more than `before`, or 1. */
function renumber(line: { from: number; text: string }, before: RegExpExecArray | null) {
  const own = ITEM_RE.exec(line.text);
  if (!own || own[2] == null) return [];
  const from = line.from + own[1].length;
  const next = before && before[2] != null ? String(Number(before[2]) + 1) : "1";
  return [{ from, to: from + own[2].length, insert: next }];
}

/** The list item line the cursor is on (not in a quote, not in code), with its indent; null otherwise. */
function itemAtCursor(state: Parameters<StateCommand>[0]["state"]) {
  const sel = state.selection.main;
  if (state.selection.ranges.length > 1) return null;
  const line = state.doc.lineAt(sel.head);
  if (sel.from < line.from || sel.to > line.to) return null; // several lines: the ordinary indent
  const m = ITEM_RE.exec(line.text);
  if (!m || inCodeBlock(state, line.from)) return null;
  return { line, indent: m[1].length };
}

/**
 * Tab on a list item: put it under the item above, at the column where that item's text starts.
 * A fixed number of spaces does not do it: under "1. " an item needs three, and two leave it
 * where it was; with a wide tab setting the spaces would turn the item into plain text or code.
 */
export const indentListItem: StateCommand = ({ state, dispatch }) => {
  const item = itemAtCursor(state);
  if (!item) return false;
  for (let n = item.line.number - 1; n >= 1; n--) {
    const text = state.doc.line(n).text;
    if (text.trim() === "") continue;
    const above = ITEM_RE.exec(text);
    const indent = /^[ \t]*/.exec(text)![0].length;
    if (indent > item.indent) continue; // text or items further in
    if (!above || indent < item.indent) return false; // nothing at this level to go under
    const column = Math.min(above[0].length, indent + above[0].trimEnd().length + 1);
    // Under "1. a", a line "2. b" would not start a list (only a 1 may follow text directly), so
    // the number is set for the new level: after the last item already there, or 1.
    const sibling = n + 1 < item.line.number ? ITEM_RE.exec(state.doc.line(item.line.number - 1).text) : null;
    const before = sibling && sibling[1].length === column ? sibling : null;
    dispatch(
      state.update({
        changes: [{ from: item.line.from, insert: " ".repeat(column - item.indent) }, ...renumber(item.line, before)],
        userEvent: "input.indent",
      }),
    );
    return true;
  }
  return false;
};

/** Shift+Tab on a nested list item: back to the level of the item it is under. */
export const outdentListItem: StateCommand = ({ state, dispatch }) => {
  const item = itemAtCursor(state);
  if (!item || item.indent === 0) return false;
  for (let n = item.line.number - 1; n >= 1; n--) {
    const text = state.doc.line(n).text;
    const above = ITEM_RE.exec(text);
    if (!above || above[1].length >= item.indent) continue;
    dispatch(
      state.update({
        changes: [{ from: item.line.from + above[1].length, to: item.line.from + item.indent, insert: "" }, ...renumber(item.line, above)],
        userEvent: "delete.dedent",
      }),
    );
    return true;
  }
  return false;
};

const continueOrBreak: StateCommand = (target) => continueList(target) || plainNewline(target);

export function listKeymap(mode: "shift" | "enter" | "off") {
  // Backspace right after a list marker removes the marker (from lang-markdown).
  const backspace = { key: "Backspace", run: deleteMarkupBackward };
  if (mode === "off") return [backspace, { key: "Enter", run: plainNewline, shift: plainNewline }];
  if (mode === "enter") return [backspace, { key: "Enter", run: continueOrBreak, shift: plainNewline }];
  return [backspace, { key: "Enter", run: plainNewline, shift: continueOrBreak }];
}
