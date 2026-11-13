import { useEffect, useRef, useState } from "react";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { MergeView, getChunks, unifiedMergeView } from "@codemirror/merge";
import { useDocStore, selectActiveDoc, fileName } from "../store/useDocStore";
import { editorRef, goToLine } from "../editor/Editor";
import { baseTheme, markdownHighlight } from "../editor/theme";
import { Splitter } from "./Splitter";
import { t } from "../i18n";
import { IconClose, IconUp, IconDown, ARROW_RIGHT_SVG } from "./icons";

/** True on screens too narrow for two columns of text (the phone layout). */
function useNarrowScreen(): boolean {
  const query = "(max-width: 767px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setNarrow(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

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
  /** The editor that holds the current text (the right side, or the only one on a narrow screen). */
  const current = useRef<EditorView | null>(null);
  const root = useRef<HTMLElement>(null);
  const narrow = useNarrowScreen();

  const oldText = base === "opened" ? doc.originalContent : doc.savedContent;

  // Build the editors; rebuilt when the document, the base text or the layout (side by side / one column) changes.
  useEffect(() => {
    if (!host.current) return;
    const parent = host.current;
    const count = (state: EditorState) => setChanges(getChunks(state)?.chunks.length ?? 0);
    const startDoc = useDocStore.getState().docs.find((d) => d.id === doc.id)?.content ?? "";
    // The editor with the current text. What is typed here is passed on to the main editor.
    const currentSide = [
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
    ];
    let view: EditorView;
    let dispose: () => void;
    if (narrow) {
      // Too narrow for two columns (a phone): one column, with the old text shown above each change.
      view = new EditorView({
        parent,
        doc: startDoc,
        extensions: [
          ...currentSide,
          unifiedMergeView({
            original: oldText,
            gutter: true,
            highlightChanges: true,
            mergeControls: (type, action) => {
              const b = document.createElement("button");
              // "Accept" would change what is compared against; only putting the old text back makes sense here.
              if (type === "accept") {
                b.hidden = true;
                return b;
              }
              b.className = "diff-revert-inline";
              b.textContent = t("この変更を元に戻す");
              b.onmousedown = action;
              return b;
            },
          }),
        ],
      });
      dispose = () => view.destroy();
    } else {
      const both = new MergeView({
        parent,
        a: { doc: oldText, extensions: [...shared, EditorState.readOnly.of(true), EditorView.editable.of(false)] },
        b: { doc: startDoc, extensions: currentSide },
        revertControls: "a-to-b",
        renderRevertControl: () => {
          const b = document.createElement("button");
          b.className = "diff-revert";
          b.innerHTML = ARROW_RIGHT_SVG;
          b.title = t("この変更を元に戻す");
          return b;
        },
        highlightChanges: true,
        gutter: true,
      });
      merge.current = both;
      view = both.b;
      // Where the strip between the two sides is, so the column headings and the divider line up with it.
      // Written straight to CSS variables: it then follows a resize within the same frame, with no render in between.
      const measure = () => {
        const strip = parent.querySelector<HTMLElement>(".cm-merge-revert")?.getBoundingClientRect();
        const box = parent.getBoundingClientRect();
        if (!strip || !root.current) return;
        root.current.style.setProperty("--strip-left", `${strip.left - box.left}px`);
        root.current.style.setProperty("--strip-width", `${strip.width}px`);
      };
      const observer = new ResizeObserver(measure);
      observer.observe(parent);
      observer.observe(both.a.dom);
      const strip = parent.querySelector(".cm-merge-revert");
      if (strip) observer.observe(strip);
      measure();
      dispose = () => {
        observer.disconnect();
        both.destroy();
      };
    }
    current.current = view;
    count(view.state);
    // Start at the first change.
    const first = getChunks(view.state)?.chunks[0];
    if (first) {
      const pos = Math.min(first.fromB, view.state.doc.length);
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    }
    // Not on a phone: focusing would bring up the keyboard over what the user came to look at.
    if (!narrow) view.focus();
    return () => {
      dispose();
      current.current = null;
      merge.current = null;
    };
  }, [doc.id, oldText, narrow]);

  // Changes made elsewhere while this is open (toolbar commands, reload from disk) show up on the right.
  useEffect(() => {
    const b = current.current;
    if (!b || b.state.doc.toString() === doc.content) return;
    b.dispatch({ changes: { from: 0, to: b.state.doc.length, insert: doc.content }, annotations: Transaction.addToHistory.of(false) });
  }, [doc.content]);

  const step = (dir: 1 | -1) => {
    const b = current.current;
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
    const b = current.current;
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
        {/* The count, the arrows and the close button stay together, so a narrow header wraps them as one group. */}
        <span className="diff-nav">
          <span className="diff-count">{changes === 0 ? t("違いはありません") : changes === 1 ? t("変更 1 箇所") : t("変更 {0} 箇所", changes)}</span>
          <button onClick={() => step(-1)} disabled={changes === 0} title={t("前の変更")}><IconUp /></button>
          <button onClick={() => step(1)} disabled={changes === 0} title={t("次の変更")}><IconDown /></button>
          {/* Kept with the arrows so it never wraps onto a line of its own. */}
          <button className="diff-close" onClick={close} title={t("閉じる (Esc)")}><IconClose /></button>
        </span>
      </div>
      <div className="diff-cols" hidden={narrow}>
        <span>{base === "opened" ? t("最初に開いたとき") : t("保存済み")}</span>
        <span className="diff-cols-strip" />
        <span>{t("現在 (編集できます)")}</span>
      </div>
      <div className="diff-main">
        <div className="diff-body" ref={host} />
        {!narrow && <Splitter
          panel="diff"
          grow={1}
          edge="after"
          track={() => {
            const a = merge.current?.a.dom.parentElement?.getBoundingClientRect();
            const b = merge.current?.b.dom.parentElement?.getBoundingClientRect();
            return a && b ? { left: a.left, width: a.width + b.width } : null;
          }}
        />}
      </div>
    </section>
  );
}
