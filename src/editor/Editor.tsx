import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { bracketMatching, indentOnInput, indentUnit } from "@codemirror/language";
import { useDocStore, selectActiveDoc } from "../store/useDocStore";
import { useSettings } from "../store/useSettings";
import { baseTheme, markdownHighlight } from "./theme";
import { toggleBold, toggleItalic, toggleCode, insertLink, setHeading } from "./formatting";
import { publishScroll, followScroll } from "../preview/useScrollSync";
import { handlePaste, handleDrop } from "./images";
import { typewriterScrolling, tabSizeExt, fullWidthHeadingFix } from "./extensions";
import { tableNextCell, tablePrevCell } from "./table";

/** Shared view so toolbar buttons and the outline can reach the editor. */
export const editorRef: { view: EditorView | null } = { view: null };

const lineWrap = new Compartment();
const tabSize = new Compartment();
const typewriter = new Compartment();

/** Editor state (undo history, selection, scroll) is kept per tab. */
const states = new Map<string, EditorState>();

function baseExtensions(opts: { lineWrap: boolean; tabSize: number; typewriter: boolean }) {
  return [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    bracketMatching(),
    indentOnInput(),
    highlightSelectionMatches(),
    lineWrap.of(opts.lineWrap ? EditorView.lineWrapping : []),
    tabSize.of([tabSizeExt(opts.tabSize), indentUnit.of(" ".repeat(opts.tabSize))]),
    typewriter.of(opts.typewriter ? typewriterScrolling : []),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    fullWidthHeadingFix,
    baseTheme,
    markdownHighlight,
    keymap.of([
      { key: "Mod-b", run: toggleBold },
      { key: "Mod-i", run: toggleItalic },
      { key: "Mod-e", run: toggleCode },
      { key: "Mod-k", run: insertLink },
      { key: "Mod-1", run: setHeading(1) },
      { key: "Mod-2", run: setHeading(2) },
      { key: "Mod-3", run: setHeading(3) },
      { key: "Tab", run: tableNextCell, shift: tablePrevCell },
      indentWithTab,
      ...searchKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        const id = currentDocId;
        if (id) useDocStore.getState().setContent(id, u.state.doc.toString());
      }
    }),
    EditorView.domEventHandlers({
      scroll: (_e, view) => publishScroll("editor", view.scrollDOM),
      paste: (e, view) => handlePaste(e, view),
      drop: (e, view) => handleDrop(e, view),
    }),
  ];
}

let currentDocId: string | null = null;

function createState(content: string) {
  const s = useSettings.getState();
  const tw = useDocStore.getState().typewriterMode;
  return EditorState.create({
    doc: content,
    extensions: baseExtensions({ lineWrap: s.lineWrap, tabSize: s.tabSize, typewriter: tw }),
  });
}

export function Editor() {
  const host = useRef<HTMLDivElement>(null);
  const doc = useDocStore(selectActiveDoc);
  const docIds = useDocStore((s) => s.docs.map((d) => d.id).join("\0"));
  const wrap = useSettings((s) => s.lineWrap);
  const tab = useSettings((s) => s.tabSize);
  const fontSize = useSettings((s) => s.editorFontSize);
  const fontFamily = useSettings((s) => s.editorFontFamily);
  const typewriterMode = useDocStore((s) => s.typewriterMode);

  // Create the view once.
  useEffect(() => {
    if (!host.current) return;
    const first = selectActiveDoc(useDocStore.getState());
    currentDocId = first.id;
    const view = new EditorView({ state: createState(first.content), parent: host.current });
    editorRef.view = view;
    view.focus();
    const unfollow = followScroll("editor", view.scrollDOM);
    return () => {
      unfollow();
      view.destroy();
      editorRef.view = null;
      currentDocId = null;
    };
  }, []);

  // Switch tabs: stash the outgoing state, restore (or create) the incoming one.
  useEffect(() => {
    const view = editorRef.view;
    if (!view) return;
    if (currentDocId === doc.id) return;
    if (currentDocId) states.set(currentDocId, view.state);
    currentDocId = doc.id;
    const saved = states.get(doc.id);
    if (saved && saved.doc.toString() === doc.content) {
      view.setState(saved);
    } else {
      view.setState(createState(doc.content));
    }
    view.focus();
  }, [doc.id, doc.content]);

  // Drop stashed states of closed tabs.
  useEffect(() => {
    const live = new Set(docIds.split("\0"));
    for (const id of Array.from(states.keys())) if (!live.has(id)) states.delete(id);
  }, [docIds]);

  // Replace the text when the document was changed outside the editor (reload from disk).
  useEffect(() => {
    const view = editorRef.view;
    if (!view || currentDocId !== doc.id) return;
    const current = view.state.doc.toString();
    if (current === doc.content) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: doc.content },
      selection: { anchor: Math.min(view.state.selection.main.anchor, doc.content.length) },
    });
  }, [doc.content, doc.id]);

  // Apply settings changes live.
  useEffect(() => {
    editorRef.view?.dispatch({ effects: lineWrap.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap]);
  useEffect(() => {
    editorRef.view?.dispatch({
      effects: tabSize.reconfigure([tabSizeExt(tab), indentUnit.of(" ".repeat(tab))]),
    });
  }, [tab]);
  useEffect(() => {
    editorRef.view?.dispatch({
      effects: typewriter.reconfigure(typewriterMode ? typewriterScrolling : []),
    });
  }, [typewriterMode]);

  const style = {
    "--editor-font-size": `${fontSize}px`,
    ...(fontFamily ? { "--mono": fontFamily } : {}),
  } as React.CSSProperties;

  return <div className="editor" ref={host} style={style} />;
}

/** Move the cursor to a 1-based line and scroll it into view (used by the outline). */
export function goToLine(line: number) {
  const view = editorRef.view;
  if (!view) return;
  const n = Math.max(1, Math.min(line, view.state.doc.lines));
  const pos = view.state.doc.line(n).from;
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 24 }),
  });
  view.focus();
}
