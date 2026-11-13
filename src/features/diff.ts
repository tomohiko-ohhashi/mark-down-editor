/**
 * The "changes" view compares the current text with what the file looked like
 * when it was first opened in this run of the app (or with the saved file).
 * This module remembers the first-opened text; the comparison itself is done
 * by @codemirror/merge in DiffPanel.
 */

/** Text of each file as it was when first opened since the app started (kept even if the tab is closed). */
const firstOpened = new Map<string, string>();

/** Remember `content` as the first-opened text of `path` unless one is already known; returns the remembered text. */
export function firstOpenedText(path: string, content: string): string {
  const known = firstOpened.get(path);
  if (known != null) return known;
  firstOpened.set(path, content);
  return content;
}
