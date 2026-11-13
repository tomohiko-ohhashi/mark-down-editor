import { EditorSelection, type StateCommand } from "@codemirror/state";
import { t } from "../i18n";

/** Wrap each selection range with `marker` (toggle off when already wrapped). */
function wrapWith(marker: string): StateCommand {
  return ({ state, dispatch }) => {
    const tr = state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to);
      const before = state.sliceDoc(Math.max(0, range.from - marker.length), range.from);
      const after = state.sliceDoc(range.to, range.to + marker.length);
      if (before === marker && after === marker) {
        return {
          changes: [
            { from: range.from - marker.length, to: range.from, insert: "" },
            { from: range.to, to: range.to + marker.length, insert: "" },
          ],
          range: EditorSelection.range(range.from - marker.length, range.to - marker.length),
        };
      }
      return {
        changes: { from: range.from, to: range.to, insert: `${marker}${text}${marker}` },
        range: EditorSelection.range(range.from + marker.length, range.to + marker.length),
      };
    });
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

export const toggleBold = wrapWith("**");
export const toggleCode = wrapWith("`");

/**
 * Italic uses "*". "_" is not emphasis when it touches a letter on the outside
 * ("これは_強調_です"), which is the normal case in Japanese, so text wrapped
 * with it would just show the underscores. Text already wrapped in "_" or "*"
 * is unwrapped; the stars of bold ("**") are not mistaken for italic.
 */
export const toggleItalic: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    const before = state.sliceDoc(Math.max(0, range.from - 3), range.from);
    const after = state.sliceDoc(range.to, range.to + 3);
    const stars = (s: string, fromEnd: boolean) => (fromEnd ? /\**$/ : /^\**/).exec(s)?.[0].length ?? 0;
    const starred = stars(before, true) % 2 === 1 && stars(after, false) % 2 === 1; // *x* or ***x***, not **x**
    const underscored = before.endsWith("_") && after.startsWith("_");
    if (starred || underscored) {
      return {
        changes: [
          { from: range.from - 1, to: range.from, insert: "" },
          { from: range.to, to: range.to + 1, insert: "" },
        ],
        range: EditorSelection.range(range.from - 1, range.to - 1),
      };
    }
    return {
      changes: { from: range.from, to: range.to, insert: `*${state.sliceDoc(range.from, range.to)}*` },
      range: EditorSelection.range(range.from + 1, range.to + 1),
    };
  });
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

/** Toggle a `# ` style heading of the given level on every selected line. */
export function setHeading(level: number): StateCommand {
  const prefix = "#".repeat(level) + " ";
  return ({ state, dispatch }) => {
    const changes: { from: number; to: number; insert: string }[] = [];
    const seen = new Set<number>();
    for (const range of state.selection.ranges) {
      const startLine = state.doc.lineAt(range.from).number;
      const endLine = state.doc.lineAt(range.to).number;
      for (let n = startLine; n <= endLine; n++) {
        if (seen.has(n)) continue;
        seen.add(n);
        const line = state.doc.line(n);
        const m = /^(#{1,6})\s+/.exec(line.text);
        if (m && m[1].length === level) {
          changes.push({ from: line.from, to: line.from + m[0].length, insert: "" });
        } else if (m) {
          changes.push({ from: line.from, to: line.from + m[0].length, insert: prefix });
        } else {
          changes.push({ from: line.from, to: line.from, insert: prefix });
        }
      }
    }
    dispatch(state.update({ changes, userEvent: "input" }));
    return true;
  };
}

export const insertLink: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to) || t("リンクテキスト");
    const insert = `[${text}](url)`;
    const urlStart = range.from + text.length + 3;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(urlStart, urlStart + 3),
    };
  });
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
};
