import { EditorSelection, type StateCommand } from "@codemirror/state";

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
export const toggleItalic = wrapWith("_");
export const toggleCode = wrapWith("`");

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
    const text = state.sliceDoc(range.from, range.to) || "リンクテキスト";
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
