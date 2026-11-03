import { useDocStore, selectIsDirty, fileName, type ViewMode } from "../store/useDocStore";
import { newDocument, openDocument, saveDocument, saveDocumentAs } from "../features/files/fileOps";
import { editorRef } from "../editor/Editor";
import { toggleBold, toggleItalic, toggleCode, insertLink, setHeading } from "../editor/formatting";
import type { StateCommand } from "@codemirror/state";

const isMac = navigator.platform.toUpperCase().includes("MAC");
const mod = isMac ? "⌘" : "Ctrl+";

function runInEditor(cmd: StateCommand) {
  const view = editorRef.view;
  if (!view) return;
  cmd(view);
  view.focus();
}

const VIEW_MODES: { mode: ViewMode; label: string; title: string }[] = [
  { mode: "editor", label: "編集", title: `エディタのみ (${mod}Shift+1)` },
  { mode: "split", label: "分割", title: `分割表示 (${mod}Shift+2)` },
  { mode: "preview", label: "プレビュー", title: `プレビューのみ (${mod}Shift+3)` },
];

export function Toolbar() {
  const path = useDocStore((s) => s.path);
  const dirty = useDocStore(selectIsDirty);
  const viewMode = useDocStore((s) => s.viewMode);
  const setViewMode = useDocStore((s) => s.setViewMode);
  const status = useDocStore((s) => s.status);

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button onClick={() => newDocument()} title={`新規 (${mod}N)`}>新規</button>
        <button onClick={() => openDocument()} title={`開く (${mod}O)`}>開く</button>
        <button onClick={() => saveDocument()} title={`保存 (${mod}S)`}>保存</button>
        <button onClick={() => saveDocumentAs()} title={`名前を付けて保存 (${mod}Shift+S)`}>名前を付けて保存</button>
      </div>
      <div className="toolbar-group">
        <button onClick={() => runInEditor(setHeading(1))} title={`見出し1 (${mod}1)`}>H1</button>
        <button onClick={() => runInEditor(setHeading(2))} title={`見出し2 (${mod}2)`}>H2</button>
        <button onClick={() => runInEditor(setHeading(3))} title={`見出し3 (${mod}3)`}>H3</button>
        <button onClick={() => runInEditor(toggleBold)} title={`太字 (${mod}B)`}><b>B</b></button>
        <button onClick={() => runInEditor(toggleItalic)} title={`斜体 (${mod}I)`}><i>I</i></button>
        <button onClick={() => runInEditor(toggleCode)} title={`コード (${mod}E)`}><code>{"<>"}</code></button>
        <button onClick={() => runInEditor(insertLink)} title={`リンク (${mod}K)`}>🔗</button>
      </div>
      <div className="toolbar-title" title={path ?? ""}>
        {dirty ? "● " : ""}{fileName(path)}
        {status && <span className="toolbar-status">{status}</span>}
      </div>
      <div className="toolbar-group segmented">
        {VIEW_MODES.map((v) => (
          <button
            key={v.mode}
            className={viewMode === v.mode ? "active" : ""}
            onClick={() => setViewMode(v.mode)}
            title={v.title}
          >
            {v.label}
          </button>
        ))}
      </div>
    </header>
  );
}
