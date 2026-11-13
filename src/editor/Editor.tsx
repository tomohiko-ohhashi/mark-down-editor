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
import { useDocStore, selectActiveDoc, flashStatus } from "../store/useDocStore";
import { useSettings } from "../store/useSettings";
import { baseTheme, markdownHighlight } from "./theme";
import { toggleBold, toggleItalic, toggleCode, insertLink, setHeading } from "./formatting";
import { publishScroll, followScroll, pauseScrollSync } from "../preview/useScrollSync";
import { handlePaste, handleDrop } from "./images";
import { typewriterScrolling, tabSizeExt, fullWidthHeadingFix } from "./extensions";
import { tableNextCell, tablePrevCell } from "./table";
import { listKeymap } from "./listContinuation";
import { formatDocument } from "./format";
import { livePreview } from "./livePreview";
import { handleSmartPaste } from "./smartPaste";
import { fontFamilyCss, MONO_FALLBACK } from "../features/fonts";
import { noteCursor, takeRestoredCursor, lineOffset } from "../features/session";
import type { ListContinuation } from "../store/useSettings";

/** Shared view so toolbar buttons and the outline can reach the editor. */
export const editorRef: { view: EditorView | null } = { view: null };

const lineWrap = new Compartment();
const tabSize = new Compartment();
const typewriter = new Compartment();
const listKeys = new Compartment();
const preview = new Compartment();

/** Editor state (undo history, selection, scroll) is kept per tab. */
const states = new Map<string, EditorState>();

function baseExtensions(opts: {
  lineWrap: boolean;
  tabSize: number;
  typewriter: boolean;
  listContinuation: ListContinuation;
  livePreview: boolean;
}) {
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
    // List/quote continuation must come before the default keymap's Enter binding.
    listKeys.of(keymap.of(listKeymap(opts.listContinuation))),
    // addKeymap: false — lang-markdown's own Enter binding (always continues
    // lists) would override the user's list-continuation setting.
    markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: false }),
    preview.of(opts.livePreview ? livePreview : []),
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
      {
        key: "Shift-Alt-f",
        run: (view) => {
          void formatDocument(view).then((changed) => {
            if (changed) flashStatus("ドキュメントを整形しました");
          });
          return true;
        },
      },
      { key: "Tab", run: tableNextCell, shift: tablePrevCell },
      indentWithTab,
      ...searchKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorView.updateListener.of((u) => {
      const id = currentDocId;
      if (u.docChanged && id) useDocStore.getState().setContent(id, u.state.doc.toString());
      if ((u.selectionSet || u.docChanged) && id) {
        // Remembered so the next start can put the cursor back.
        const path = useDocStore.getState().docs.find((d) => d.id === id)?.path ?? null;
        noteCursor(path, u.state.doc.lineAt(u.state.selection.main.head).number);
      }
    }),
    EditorView.domEventHandlers({
      scroll: (_e, view) => publishScroll("editor", view.scrollDOM),
      paste: (e, view) => handlePaste(e, view) || handleSmartPaste(e, view),
      drop: (e, view) => handleDrop(e, view),
    }),
  ];
}

let currentDocId: string | null = null;

function createState(content: string, cursor = 0) {
  const s = useSettings.getState();
  const tw = useDocStore.getState().typewriterMode;
  return EditorState.create({
    doc: content,
    selection: { anchor: cursor },
    extensions: baseExtensions({
      lineWrap: s.lineWrap,
      tabSize: s.tabSize,
      typewriter: tw,
      listContinuation: s.listContinuation,
      livePreview: s.livePreview,
    }),
  });
}

/** Have the preview scroll to a source line once it has rendered the active document. */
function showInPreview(line: number) {
  pauseScrollSync(700);
  useDocStore.setState({ reveal: { line, seq: -Date.now() } });
}

/** State for a tab shown for the first time; a file from the previous session gets its cursor back. */
function freshState(doc: { path: string | null; content: string }) {
  const line = takeRestoredCursor(doc.path);
  return createState(doc.content, line != null ? lineOffset(doc.content, line) : 0);
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
  const viewMode = useDocStore((s) => s.viewMode);
  const prevMode = useRef(viewMode);
  const listContinuation = useSettings((s) => s.listContinuation);
  const livePreviewOn = useSettings((s) => s.livePreview);

  // Create the view once.
  useEffect(() => {
    if (!host.current) return;
    const first = selectActiveDoc(useDocStore.getState());
    currentDocId = first.id;
    const view = new EditorView({ state: freshState(first), parent: host.current });
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
      // The stashed state carries the settings from when it was put away.
      const s = useSettings.getState();
      view.dispatch({
        effects: [
          lineWrap.reconfigure(s.lineWrap ? EditorView.lineWrapping : []),
          tabSize.reconfigure([tabSizeExt(s.tabSize), indentUnit.of(" ".repeat(s.tabSize))]),
          typewriter.reconfigure(useDocStore.getState().typewriterMode ? typewriterScrolling : []),
          listKeys.reconfigure(keymap.of(listKeymap(s.listContinuation))),
          preview.reconfigure(s.livePreview ? livePreview : []),
        ],
      });
    } else {
      view.setState(freshState(doc));
    }
    // Back to where the cursor is in this tab (also after a restart), in both panes.
    const head = view.state.selection.main.head;
    if (head > 0) {
      view.dispatch({ effects: EditorView.scrollIntoView(head, { y: "center" }) });
      showInPreview(view.state.doc.lineAt(head).number);
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
    // A file loaded into this tab at start-up gets its cursor from the previous session.
    const restored = takeRestoredCursor(doc.path);
    const anchor =
      restored != null ? lineOffset(doc.content, restored) : Math.min(view.state.selection.main.anchor, doc.content.length);
    view.dispatch({
      changes: { from: 0, to: current.length, insert: doc.content },
      selection: { anchor },
      effects: restored != null ? EditorView.scrollIntoView(anchor, { y: "center" }) : [],
    });
    if (restored != null && anchor > 0) showInPreview(restored);
  }, [doc.content, doc.id, doc.path]);

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
  useEffect(() => {
    editorRef.view?.dispatch({ effects: listKeys.reconfigure(keymap.of(listKeymap(listContinuation))) });
  }, [listContinuation]);
  useEffect(() => {
    editorRef.view?.dispatch({ effects: preview.reconfigure(livePreviewOn ? livePreview : []) });
  }, [livePreviewOn]);

  // A different font changes the character metrics the editor has cached.
  useEffect(() => {
    editorRef.view?.requestMeasure();
  }, [fontFamily, fontSize]);

  // Coming back from preview-only: the editor was hidden, so bring the cursor into view.
  useEffect(() => {
    const was = prevMode.current;
    prevMode.current = viewMode;
    if (was !== "preview" || viewMode === "preview") return;
    const id = requestAnimationFrame(() => {
      const view = editorRef.view;
      if (!view) return;
      pauseScrollSync(400);
      view.requestMeasure();
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "start", yMargin: 24 }) });
    });
    return () => cancelAnimationFrame(id);
  }, [viewMode]);

  const style = {
    "--editor-font-size": `${fontSize}px`,
    ...(fontFamilyCss(fontFamily, MONO_FALLBACK) ? { "--mono": fontFamilyCss(fontFamily, MONO_FALLBACK) } : {}),
  } as React.CSSProperties;

  return <div className="editor" ref={host} style={style} />;
}

/** Move the cursor to a 1-based line and scroll it into view (used by the outline). */
export function goToLine(line: number, focus = true) {
  const view = editorRef.view;
  if (!view) return;
  const n = Math.max(1, Math.min(line, view.state.doc.lines));
  const pos = view.state.doc.line(n).from;
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 24 }),
  });
  if (focus) view.focus();
}

/** 1-based line of the editor cursor (1 when there is no editor). */
export function cursorLine(): number {
  const view = editorRef.view;
  return view ? view.state.doc.lineAt(view.state.selection.main.head).number : 1;
}
