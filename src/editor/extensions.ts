import { html } from "@codemirror/lang-html";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";

/** Keep the cursor line vertically centred while typing (typewriter scrolling). */
export const typewriterScrolling = [
  EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;
    const head = update.state.selection.main.head;
    requestAnimationFrame(() => {
      update.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: "center" }) });
    });
  }),
  EditorView.theme({
    ".cm-content": { paddingTop: "45vh", paddingBottom: "45vh" },
  }),
];

export const tabSizeExt = (n: number) => EditorState.tabSize.of(n);

/**
 * Japanese IMEs emit full-width "＃" and "　" when typing a heading marker in
 * kana mode, which Markdown does not recognise. Convert them at the start of a
 * line so "＃＃　見出し" becomes "## 見出し".
 */
export const fullWidthHeadingFix = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== "＃" && text !== "　") return false;
  const line = view.state.doc.lineAt(from);
  const before = line.text.slice(0, from - line.from);
  let insert: string | null = null;
  if (text === "＃" && /^#{0,5}$/.test(before)) insert = "#";
  if (text === "　" && /^#{1,6}$/.test(before)) insert = " ";
  if (insert === null) return false;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    userEvent: "input.type",
  });
  return true;
});

/**
 * HTML inside Markdown, without the HTML package's habit of closing tags by
 * itself: with it, typing "<div>" inserts "</div>", and whoever then types the
 * closing tag by hand ends up with two. The editor writes what is typed.
 */
export const plainHtmlTags = html({ matchClosingTags: false, autoCloseTags: false });
