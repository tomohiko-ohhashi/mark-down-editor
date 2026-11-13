import { useEffect, useRef, useState } from "react";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { MergeView, getChunks } from "@codemirror/merge";
import { useDocStore, selectActiveDoc, fileName } from "../store/useDocStore";
import { editorRef, goToLine } from "../editor/Editor";
import { baseTheme, markdownHighlight } from "../editor/theme";
import { Splitter } from "./Splitter";
import { t } from "../i18n";

type Base = "opened" | "saved";

const shared = [lineNumbers(), drawSelection(), EditorView.lineWrapping, markdown({ base: markdownLanguage, addKeymap: false }), baseTheme, markdownHighlight];

/**
 * Side-by-side view of what changed in the active document, like a merge
 * tool: on the left the text it had when first opened since the app started
 * (or the saved file), on the right the current text, which can be edited
 * here. Each change has a button to put the old text back.
 *
 * The right side is its own editor. What is typed there is passed on to the
 * main editor as ordinary edits, so the document, its unsaved mark and the
 * main editor's undo history stay in step.
 */
export function DiffPanel() {
  const doc = useDocStore(selectActiveDoc);
  const toggle = useDocStore((s) => s.toggle);
  const [base, setBase] = useState<Base>("opened");
  const [changes, setChanges] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const merge = useRef<MergeView | null>(null);
  const root = useRef<HTMLElement>(null);

  const oldText = base === "opened" ? doc.originalContent : doc.savedContent;

  // Build the two editors; rebuilt when the document or the base text changes.
  useEffect(() => {
    if (!host.current) return;
    const count = (state: EditorState) => setChanges(getChunks(state)?.chunks.length ?? 0);
    const view = new MergeView({
      parent: host.current,
      a: { doc: oldText, extensions: [...shared, EditorState.readOnly.of(true), EditorView.editable.of(false)] },
      b: {
        doc: useDocStore.getState().docs.find((d) => d.id === doc.id)?.content ?? "",
        extensions: [
          ...shared,
          highlightActiveLine(),
          history(),
          keymap.of([indentWithTab, ...historyKeymap, ...defaultKeymap]),
          EditorView.updateListener.of((u) => {
            count(u.state);
            if (!u.docChanged) return;
            const main = editorRef.view;
            if (!main || main.state.doc.eq(u.state.doc)) return; // came from the main editor
            // Same edit on the main editor, so it lands in the document and in its undo history.
            if (main.state.doc.eq(u.startState.doc)) main.dispatch({ changes: u.changes, userEvent: "input" });
            else main.dispatch({ changes: { from: 0, to: main.state.doc.length, insert: u.state.doc.toString() } });
          }),
        ],
      },
      revertControls: "a-to-b",
      renderRevertControl: () => {
        const b = document.createElement("button");
        b.className = "diff-revert";
        b.textContent = "→";
        b.title = t("この変更を元に戻す");
        return b;
      },
      highlightChanges: true,
      gutter: true,
    });
    merge.current = view;
    count(view.b.state);
    // Where the strip between the two sides is, so the column headings and the divider line up with it.
    // Written straight to CSS variables: it then follows a resize within the same frame, with no render in between.
    const measure = () => {
      const strip = host.current?.querySelector<HTMLElement>(".cm-merge-revert")?.getBoundingClientRect();
      const box = host.current?.getBoundingClientRect();
      if (!strip || !box || !root.current) return;
      root.current.style.setProperty("--strip-left", `${strip.left - box.left}px`);
      root.current.style.setProperty("--strip-width", `${strip.width}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(host.current);
    observer.observe(view.a.dom);
    const strip = host.current.querySelector(".cm-merge-revert");
    if (strip) observer.observe(strip);
    measure();
    // Start at the first change.
    const first = getChunks(view.b.state)?.chunks[0];
    if (first) view.b.dispatch({ selection: { anchor: Math.min(first.fromB, view.b.state.doc.length) }, effects: EditorView.scrollIntoView(Math.min(first.fromB, view.b.state.doc.length), { y: "center" }) });
    view.b.focus();
    return () => {
      observer.disconnect();
      view.destroy();
      merge.current = null;
    };
  }, [doc.id, oldText]);

  // Changes made elsewhere while this is open (toolbar commands, reload from disk) show up on the right.
  useEffect(() => {
    const b = merge.current?.b;
    if (!b || b.state.doc.toString() === doc.content) return;
    b.dispatch({ changes: { from: 0, to: b.state.doc.length, insert: doc.content }, annotations: Transaction.addToHistory.of(false) });
  }, [doc.content]);

  const step = (dir: 1 | -1) => {
    const b = merge.current?.b;
    const chunks = b && getChunks(b.state)?.chunks;
    if (!b || !chunks || chunks.length === 0) return;
    const head = b.state.selection.main.head;
    const next = dir === 1 ? (chunks.find((c) => c.fromB > head) ?? chunks[0]) : ([...chunks].reverse().find((c) => c.fromB < head) ?? chunks[chunks.length - 1]);
    const pos = Math.min(next.fromB, b.state.doc.length);
    b.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    b.focus();
  };

  const close = () => {
    // Go back to the main editor at the line the cursor is on here.
    const b = merge.current?.b;
    const line = b ? b.state.doc.lineAt(b.state.selection.main.head).number : null;
    toggle("diffOpen");
    if (line != null) requestAnimationFrame(() => requestAnimationFrame(() => goToLine(line)));
  };

  return (
    <section className="diff" aria-label={t("変更箇所")} ref={root}>
      <div className="diff-head">
        <strong>{t("変更箇所")}</strong>
        <span className="diff-file">{fileName(doc.path)}</span>
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={base === "opened"} className={base === "opened" ? "active" : ""} onClick={() => setBase("opened")} title={t("アプリを起動してから最初に開いたときの内容と比べる")}>
            {t("最初に開いたときと比較")}
          </button>
          <button role="tab" aria-selected={base === "saved"} className={base === "saved" ? "active" : ""} onClick={() => setBase("saved")} title={t("ファイルに保存されている内容と比べる")}>
            {t("保存済みの内容と比較")}
          </button>
        </div>
        <span className="diff-count">{changes === 0 ? t("違いはありません") : changes === 1 ? t("変更 1 箇所") : t("変更 {0} 箇所", changes)}</span>
        <span className="diff-nav">
          <button onClick={() => step(-1)} disabled={changes === 0} title={t("前の変更")}>↑</button>
          <button onClick={() => step(1)} disabled={changes === 0} title={t("次の変更")}>↓</button>
          {/* Kept with the arrows so it never wraps onto a line of its own. */}
          <button className="diff-close" onClick={close} title={t("閉じる (Esc)")}>×</button>
        </span>
      </div>
      <div className="diff-cols">
        <span>{base === "opened" ? t("最初に開いたとき") : t("保存済み")}</span>
        <span className="diff-cols-strip" />
        <span>{t("現在 (編集できます)")}</span>
      </div>
      <div className="diff-main">
        <div className="diff-body" ref={host} />
        <Splitter
          panel="diff"
          grow={1}
          edge="after"
          track={() => {
            const a = merge.current?.a.dom.parentElement?.getBoundingClientRect();
            const b = merge.current?.b.dom.parentElement?.getBoundingClientRect();
            return a && b ? { left: a.left, width: a.width + b.width } : null;
          }}
        />
      </div>
    </section>
  );
}
