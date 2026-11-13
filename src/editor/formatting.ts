import { EditorSelection, type EditorState, type StateCommand } from "@codemirror/state";
import { t } from "../i18n";

const LINE_MARKER = /^\s*(?:>\s*)*(?:(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?)?(?:#{1,6}\s+)?/;

/** The part of each selected line that has text: [from, to) without the white space around it. */
function textPieces(state: EditorState, from: number, to: number): { from: number; to: number }[] {
  const pieces: { from: number; to: number }[] = [];
  for (let pos = from; pos <= to; ) {
    const line = state.doc.lineAt(pos);
    // From the start of a line: after its list / quote / heading marker, which is not part of the text.
    const marker = from <= line.from ? (LINE_MARKER.exec(line.text)?.[0].length ?? 0) : 0;
    const a = Math.max(from, line.from + marker);
    const b = Math.max(a, Math.min(to, line.to));
    const text = state.sliceDoc(a, b);
    const lead = text.length - text.trimStart().length;
    const trail = text.length - text.trimEnd().length;
    if (text.trim() !== "") pieces.push({ from: a + lead, to: b - trail });
    pos = line.to + 1;
  }
  return pieces;
}

interface Emphasis {
  /** What is put around the text. */
  marker: string;
  /** How many characters of marker stand on each side of [from, to), or 0 when it is not wrapped. */
  around: (state: EditorState, from: number, to: number) => number;
  /** How many characters of marker the text itself starts and ends with, or 0. */
  within: (text: string) => number;
}

/**
 * Put `marker` around the selection, or take it away when it is already there.
 *
 * - The marker goes around the text, not around the white space or the line break that was
 *   selected with it ("** text**" and "**line⏎**" are not emphasis in Markdown), and around
 *   each line separately when several are selected.
 * - With nothing selected: in an empty pair the pair is removed; right before a closing marker
 *   the cursor steps over it (pressing the shortcut again to "switch off"); otherwise an empty
 *   pair is inserted with the cursor inside.
 */
function toggleEmphasis(kind: Emphasis): StateCommand {
  const { marker } = kind;
  return ({ state, dispatch }) => {
    const tr = state.changeByRange((range) => {
      if (range.empty) {
        const around = kind.around(state, range.from, range.from);
        if (around > 0) {
          return {
            changes: { from: range.from - around, to: range.from + around, insert: "" },
            range: EditorSelection.cursor(range.from - around),
          };
        }
        const closing = state.sliceDoc(range.from, range.from + marker.length) === marker && kind.around(state, range.from, range.from + marker.length) === 0;
        if (closing) return { range: EditorSelection.cursor(range.from + marker.length) };
        return {
          changes: { from: range.from, insert: marker + marker },
          range: EditorSelection.cursor(range.from + marker.length),
        };
      }
      const pieces = textPieces(state, range.from, range.to);
      if (pieces.length === 0) return { range };
      const state_ = pieces.map((p) => ({ ...p, around: kind.around(state, p.from, p.to), within: kind.within(state.sliceDoc(p.from, p.to)) }));
      const allWrapped = state_.every((p) => p.around > 0 || p.within > 0);
      const changes: { from: number; to?: number; insert: string }[] = [];
      for (const p of state_) {
        if (allWrapped) {
          const n = p.around || p.within;
          const [a, b] = p.around > 0 ? [p.from - n, p.to] : [p.from, p.to - n];
          changes.push({ from: a, to: a + n, insert: "" }, { from: b, to: b + n, insert: "" });
        } else if (p.around === 0 && p.within === 0) {
          changes.push({ from: p.from, insert: marker }, { from: p.to, insert: marker });
        }
      }
      const set = state.changes(changes);
      const first = state_[0];
      const last = state_[state_.length - 1];
      // The selection stays on the text, inside the markers.
      const start = allWrapped && first.around === 0 ? first.from + first.within : first.from;
      const end = allWrapped && last.around === 0 ? last.to - last.within : last.to;
      return { changes: set, range: EditorSelection.range(set.mapPos(start, 1), set.mapPos(end, -1)) };
    });
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

/** Length of the run of `ch` that ends at `pos` (backwards) or starts at it (forwards). */
function run(state: EditorState, pos: number, ch: string, dir: -1 | 1): number {
  let n = 0;
  while (state.sliceDoc(dir < 0 ? pos - n - 1 : pos + n, dir < 0 ? pos - n : pos + n + 1) === ch) n++;
  return n;
}

const edges = (text: string, ch: string) => {
  let a = 0;
  let b = 0;
  while (text[a] === ch) a++;
  while (text[text.length - 1 - b] === ch) b++;
  return a + b < text.length ? Math.min(a, b) : 0;
};

export const toggleBold = toggleEmphasis({
  marker: "**",
  around: (state, from, to) => (run(state, from, "*", -1) >= 2 && run(state, to, "*", 1) >= 2 ? 2 : 0),
  within: (text) => (edges(text, "*") >= 2 ? 2 : 0),
});

export const toggleCode = toggleEmphasis({
  marker: "`",
  around: (state, from, to) => (run(state, from, "`", -1) >= 1 && run(state, to, "`", 1) >= 1 ? 1 : 0),
  within: (text) => (edges(text, "`") >= 1 ? 1 : 0),
});

const isWord = (ch: string) => /[\p{L}\p{N}]/u.test(ch);

/**
 * Italic uses "*". "_" is not emphasis when it touches a letter on the outside
 * ("これは_強調_です"), which is the normal case in Japanese, so text wrapped
 * with it would just show the underscores. Text already wrapped in "*" or in a
 * working "_" is unwrapped. The stars of bold ("**") are not mistaken for
 * italic, and the underscores of a name ("snake_case_name") are left alone.
 */
export const toggleItalic = toggleEmphasis({
  marker: "*",
  around: (state, from, to) => {
    // *x* or ***x***, not **x**
    if (run(state, from, "*", -1) % 2 === 1 && run(state, to, "*", 1) % 2 === 1) return 1;
    const before = run(state, from, "_", -1);
    const after = run(state, to, "_", 1);
    const outsideIsText = isWord(state.sliceDoc(from - before - 1, from - before)) || isWord(state.sliceDoc(to + after, to + after + 1));
    return before % 2 === 1 && after % 2 === 1 && !outsideIsText ? 1 : 0;
  },
  within: (text) => (edges(text, "*") % 2 === 1 ? 1 : 0),
});

/** Toggle a `# ` style heading of the given level on every selected line. */
export function setHeading(level: number): StateCommand {
  const prefix = "#".repeat(level) + " ";
  return ({ state, dispatch }) => {
    const changes: { from: number; to: number; insert: string }[] = [];
    const seen = new Set<number>();
    for (const range of state.selection.ranges) {
      const startLine = state.doc.lineAt(range.from).number;
      let endLine = state.doc.lineAt(range.to).number;
      // A selection that ends at the very start of a line (a triple click, Shift+Down) does not include that line.
      if (endLine > startLine && range.to === state.doc.line(endLine).from) endLine--;
      for (let n = startLine; n <= endLine; n++) {
        if (seen.has(n)) continue;
        seen.add(n);
        const line = state.doc.line(n);
        // Blank lines between the selected lines do not become empty headings.
        if (endLine > startLine && line.text.trim() === "") continue;
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
    // A cursor at the start of the line (or in the old marker) goes after the new "# ". The default
    // would leave it in front, and what is typed next would land before the marker: "Title# ".
    const changeSet = state.changes(changes);
    const place = (pos: number) => {
      const marker = changes.find((c) => pos >= c.from && pos <= c.to);
      return changeSet.mapPos(marker ? marker.to : pos, 1);
    };
    const selection = EditorSelection.create(
      state.selection.ranges.map((r) => EditorSelection.range(place(r.anchor), place(r.head))),
      state.selection.mainIndex,
    );
    dispatch(state.update({ changes: changeSet, selection, scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

export const insertLink: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    // The link goes around the text, not around the spaces or the line break selected with it.
    const selected = state.sliceDoc(range.from, range.to);
    const from = range.from + (selected.length - selected.trimStart().length);
    const to = Math.max(from, range.to - (selected.length - selected.trimEnd().length));
    const text = state.sliceDoc(from, to) || t("リンクテキスト");
    const insert = `[${text}](url)`;
    const urlStart = from + text.length + 3;
    return {
      changes: { from, to, insert },
      range: EditorSelection.range(urlStart, urlStart + 3),
    };
  });
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
};
