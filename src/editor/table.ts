import { EditorSelection, type EditorState, type StateCommand } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { t as tr } from "../i18n";

/** Display width: CJK and full-width characters count as 2 columns. */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    w +=
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x1f300 && c <= 0x1faff) ||
      (c >= 0x20000 && c <= 0x3fffd)
        ? 2
        : 1;
  }
  return w;
}

const isTableLine = (text: string) => /^\s*\|.*\|\s*$/.test(text);
const isDelimiterRow = (text: string) => /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(text);

/** Split a table row into cell strings, honouring escaped pipes. */
export function splitRow(text: string): string[] {
  const t = text.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === "\\" && t[i + 1] === "|") {
      cur += "\\|";
      i++;
      continue;
    }
    if (ch === "`") inCode = !inCode;
    if (ch === "|" && !inCode) {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export interface TableInfo {
  /** 1-based line numbers of the first and last table rows. */
  startLine: number;
  endLine: number;
  rows: string[][];
  /** Column alignment taken from the delimiter row. */
  aligns: ("left" | "center" | "right" | "none")[];
}

/** Find the pipe table around the cursor, if any. */
export function tableAt(state: EditorState, pos: number): TableInfo | null {
  const doc = state.doc;
  const cur = doc.lineAt(pos);
  if (!isTableLine(cur.text)) return null;
  let start = cur.number;
  while (start > 1 && isTableLine(doc.line(start - 1).text)) start--;
  let end = cur.number;
  while (end < doc.lines && isTableLine(doc.line(end + 1).text)) end++;
  if (end - start < 1 || !isDelimiterRow(doc.line(start + 1).text)) return null;

  const rows: string[][] = [];
  for (let n = start; n <= end; n++) {
    if (n === start + 1) continue;
    rows.push(splitRow(doc.line(n).text));
  }
  const aligns = splitRow(doc.line(start + 1).text).map((d) => {
    const l = d.startsWith(":");
    const r = d.endsWith(":");
    return l && r ? "center" : r ? "right" : l ? "left" : "none";
  });
  const cols = Math.max(aligns.length, ...rows.map((r) => r.length));
  for (const r of rows) while (r.length < cols) r.push("");
  while (aligns.length < cols) aligns.push("none");
  return { startLine: start, endLine: end, rows, aligns };
}

function pad(s: string, width: number, align: TableInfo["aligns"][number]) {
  const gap = Math.max(0, width - displayWidth(s));
  if (align === "right") return " ".repeat(gap) + s;
  if (align === "center") {
    const l = Math.floor(gap / 2);
    return " ".repeat(l) + s + " ".repeat(gap - l);
  }
  return s + " ".repeat(gap);
}

/** Serialize a table with aligned columns. */
export function formatTable(t: TableInfo): string {
  const cols = t.aligns.length;
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.max(3, ...t.rows.map((r) => displayWidth(r[c] ?? ""))),
  );
  const line = (cells: string[]) =>
    "| " + cells.map((c, i) => pad(c, widths[i], t.aligns[i])).join(" | ") + " |";
  const delim =
    "| " +
    t.aligns
      .map((a, i) => {
        const w = widths[i];
        if (a === "center") return ":" + "-".repeat(w - 2) + ":";
        if (a === "right") return "-".repeat(w - 1) + ":";
        if (a === "left") return ":" + "-".repeat(w - 1);
        return "-".repeat(w);
      })
      .join(" | ") +
    " |";
  const out = [line(t.rows[0]), delim, ...t.rows.slice(1).map(line)];
  return out.join("\n");
}

function replaceTable(view: EditorView, t: TableInfo, text: string, cursor?: { row: number; col: number }) {
  const from = view.state.doc.line(t.startLine).from;
  const to = view.state.doc.line(t.endLine).to;
  let selection: EditorSelection | undefined;
  if (cursor) {
    // Place the cursor at the end of the target cell's content in the new text.
    const lines = text.split("\n");
    const lineIdx = Math.min(cursor.row === 0 ? 0 : cursor.row + 1, lines.length - 1);
    const lineText = lines[lineIdx];
    let lineStart = from;
    for (let i = 0; i < lineIdx; i++) lineStart += lines[i].length + 1;
    const pipes: number[] = [];
    let inCode = false;
    for (let i = 0; i < lineText.length; i++) {
      if (lineText[i] === "`") inCode = !inCode;
      if (lineText[i] === "|" && lineText[i - 1] !== "\\" && !inCode) pipes.push(i);
    }
    const segStart = (pipes[cursor.col] ?? -1) + 1;
    const segEnd = pipes[cursor.col + 1] ?? lineText.length;
    const seg = lineText.slice(segStart, segEnd);
    const contentStart = segStart + (seg.length - seg.trimStart().length);
    const anchor = lineStart + contentStart + seg.trim().length;
    selection = EditorSelection.single(anchor);
  }
  view.dispatch({ changes: { from, to, insert: text }, selection, scrollIntoView: true, userEvent: "input" });
}

/** Which cell is the cursor in? */
function cellAt(state: EditorState, t: TableInfo, pos: number): { row: number; col: number } {
  const line = state.doc.lineAt(pos);
  const rowIdx = line.number === t.startLine ? 0 : line.number - t.startLine - 1;
  const before = line.text.slice(0, pos - line.from);
  let col = 0;
  let inCode = false;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === "`") inCode = !inCode;
    if (before[i] === "|" && before[i - 1] !== "\\" && !inCode) col++;
  }
  return { row: Math.max(0, rowIdx), col: Math.max(0, col - 1) };
}

/** Tab inside a table: move to the next cell, appending a row after the last cell. */
export const tableNextCell: StateCommand = (target) => {
  const view = target as EditorView;
  const pos = view.state.selection.main.head;
  const t = tableAt(view.state, pos);
  if (!t) return false;
  const line = view.state.doc.lineAt(pos);
  if (line.number === t.startLine + 1) return false; // delimiter row
  const { row, col } = cellAt(view.state, t, pos);
  let nr = row;
  let nc = col + 1;
  if (nc >= t.aligns.length) {
    nc = 0;
    nr = row + 1;
    if (nr >= t.rows.length) t.rows.push(t.aligns.map(() => ""));
  }
  replaceTable(view, t, formatTable(t), { row: nr, col: nc });
  return true;
};

export const tablePrevCell: StateCommand = (target) => {
  const view = target as EditorView;
  const pos = view.state.selection.main.head;
  const t = tableAt(view.state, pos);
  if (!t) return false;
  const line = view.state.doc.lineAt(pos);
  if (line.number === t.startLine + 1) return false;
  const { row, col } = cellAt(view.state, t, pos);
  let nr = row;
  let nc = col - 1;
  if (nc < 0) {
    if (row === 0) return true;
    nr = row - 1;
    nc = t.aligns.length - 1;
  }
  replaceTable(view, t, formatTable(t), { row: nr, col: nc });
  return true;
};

export const tableFormat: StateCommand = (target) => {
  const view = target as EditorView;
  const pos = view.state.selection.main.head;
  const t = tableAt(view.state, pos);
  if (!t) return false;
  const c = cellAt(view.state, t, pos);
  replaceTable(view, t, formatTable(t), c);
  return true;
};

function edit(fn: (t: TableInfo, c: { row: number; col: number }) => { row: number; col: number } | void): StateCommand {
  return (target) => {
    const view = target as EditorView;
    const pos = view.state.selection.main.head;
    const t = tableAt(view.state, pos);
    if (!t) return false;
    const c = cellAt(view.state, t, pos);
    const next = fn(t, c) ?? c;
    replaceTable(view, t, formatTable(t), {
      row: Math.min(next.row, t.rows.length - 1),
      col: Math.min(next.col, t.aligns.length - 1),
    });
    return true;
  };
}

export const tableAddRowBelow = edit((t, c) => {
  t.rows.splice(c.row + 1, 0, t.aligns.map(() => ""));
  return { row: c.row + 1, col: 0 };
});
export const tableDeleteRow = edit((t, c) => {
  if (c.row === 0 || t.rows.length <= 1) return; // keep the header
  t.rows.splice(c.row, 1);
  return { row: Math.max(0, c.row - 1), col: c.col };
});
export const tableAddColumnRight = edit((t, c) => {
  for (const r of t.rows) r.splice(c.col + 1, 0, "");
  t.aligns.splice(c.col + 1, 0, "none");
  return { row: c.row, col: c.col + 1 };
});
export const tableDeleteColumn = edit((t, c) => {
  if (t.aligns.length <= 1) return;
  for (const r of t.rows) r.splice(c.col, 1);
  t.aligns.splice(c.col, 1);
  return { row: c.row, col: Math.max(0, c.col - 1) };
});
export const tableCycleAlign = edit((t, c) => {
  const order: TableInfo["aligns"][number][] = ["none", "left", "center", "right"];
  t.aligns[c.col] = order[(order.indexOf(t.aligns[c.col]) + 1) % order.length];
});

/** Insert an empty rows×cols table at the cursor (on its own paragraph). */
export function insertTable(view: EditorView, rows: number, cols: number) {
  const headers = Array.from({ length: cols }, (_, i) => tr("列{0}", i + 1));
  const t: TableInfo = {
    startLine: 0,
    endLine: 0,
    aligns: headers.map(() => "none"),
    rows: [headers, ...Array.from({ length: Math.max(1, rows - 1) }, () => headers.map(() => ""))],
  };
  const text = formatTable(t);
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const prefix = line.text.trim() === "" ? "" : "\n\n";
  const insert = prefix + text + "\n";
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + prefix.length + 2 },
    scrollIntoView: true,
    userEvent: "input",
  });
  view.focus();
}
