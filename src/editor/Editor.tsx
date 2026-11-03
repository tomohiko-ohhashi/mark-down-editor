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
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { useDocStore } from "../store/useDocStore";
import { baseTheme, markdownHighlight } from "./theme";
import { toggleBold, toggleItalic, toggleCode, insertLink, setHeading } from "./formatting";
import { publishScroll, followScroll } from "../preview/useScrollSync";

/** Shared view so toolbar buttons and the scroll-sync hook can reach the editor. */
export const editorRef: { view: EditorView | null } = { view: null };

const lineWrap = new Compartment();

export function Editor() {
  const host = useRef<HTMLDivElement>(null);
  const content = useDocStore((s) => s.content);

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: useDocStore.getState().content,
      extensions: [
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
        lineWrap.of(EditorView.lineWrapping),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
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
          indentWithTab,
          ...searchKeymap,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            useDocStore.getState().setContent(u.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({
          scroll: (_e, view) => {
            publishScroll("editor", view.scrollDOM);
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent: host.current });
    editorRef.view = view;
    view.focus();
    return () => {
      view.destroy();
      editorRef.view = null;
    };
  }, []);

  // Replace the document when it was changed outside the editor (open/new/reload).
  useEffect(() => {
    const view = editorRef.view;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === content) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
      selection: { anchor: 0 },
    });
  }, [content]);

  // Follow preview scrolls.
  useEffect(() => {
    const view = editorRef.view;
    if (!view) return;
    return followScroll("editor", view.scrollDOM);
  }, []);

  return <div className="editor" ref={host} />;
}
