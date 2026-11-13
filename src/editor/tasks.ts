import { editorRef } from "./Editor";

/**
 * Where the check mark of a task-list line is and what to put there to flip
 * it; null when the line is not a task item. Works for "- [ ]", "* [x]",
 * "1. [ ]" and items inside block quotes.
 */
export function taskToggle(lineText: string): { offset: number; insert: string } | null {
  const m = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/.exec(lineText);
  if (!m) return null;
  return { offset: m[1].length, insert: m[2] === " " ? "x" : " " };
}

/** Tick / untick the task on a 1-based source line (used by the checkboxes in the preview). */
export function toggleTaskAtLine(line: number): boolean {
  const view = editorRef.view;
  if (!view || line < 1 || line > view.state.doc.lines) return false;
  const l = view.state.doc.line(line);
  const t = taskToggle(l.text);
  if (!t) return false;
  const pos = l.from + t.offset;
  view.dispatch({ changes: { from: pos, to: pos + 1, insert: t.insert }, userEvent: "input" });
  return true;
}
