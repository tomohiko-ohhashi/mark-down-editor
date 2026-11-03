import { useState } from "react";
import { useDocStore, selectActiveDoc, selectActiveIsDirty, fileName, type ViewMode } from "../store/useDocStore";
import { useSettings } from "../store/useSettings";
import { newDocument, openDocument, openWorkspace, saveDocument, saveDocumentAs } from "../features/files/fileOps";
import { exportHtml, exportPdf } from "../features/export";
import { editorRef } from "../editor/Editor";
import { toggleBold, toggleItalic, toggleCode, insertLink, setHeading } from "../editor/formatting";
import {
  insertTable,
  tableFormat,
  tableAddRowBelow,
  tableDeleteRow,
  tableAddColumnRight,
  tableDeleteColumn,
  tableCycleAlign,
} from "../editor/table";
import { Dropdown } from "./Dropdown";
import type { StateCommand } from "@codemirror/state";

const isMac = navigator.platform.toUpperCase().includes("MAC");
const mod = isMac ? "⌘" : "Ctrl+";
const shift = isMac ? "⇧" : "Shift+";

function runInEditor(cmd: StateCommand) {
  const view = editorRef.view;
  if (!view) return;
  cmd(view);
  view.focus();
}

const VIEW_MODES: { mode: ViewMode; label: string; title: string }[] = [
  { mode: "editor", label: "編集", title: `エディタのみ (${mod}${shift}1)` },
  { mode: "split", label: "分割", title: `分割表示 (${mod}${shift}2)` },
  { mode: "preview", label: "プレビュー", title: `プレビューのみ (${mod}${shift}3)` },
];

function TableInsert({ close }: { close: () => void }) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  return (
    <div className="table-insert">
      <label>行 <input type="number" min={1} max={50} value={rows} onChange={(e) => setRows(Number(e.target.value) || 1)} /></label>
      <label>列 <input type="number" min={1} max={20} value={cols} onChange={(e) => setCols(Number(e.target.value) || 1)} /></label>
      <button
        onClick={() => {
          if (editorRef.view) insertTable(editorRef.view, rows, cols);
          close();
        }}
      >
        挿入
      </button>
    </div>
  );
}

export function Toolbar() {
  const doc = useDocStore(selectActiveDoc);
  const dirty = useDocStore(selectActiveIsDirty);
  const viewMode = useDocStore((s) => s.viewMode);
  const setViewMode = useDocStore((s) => s.setViewMode);
  const status = useDocStore((s) => s.status);
  const toggle = useDocStore((s) => s.toggle);
  const showSidebar = useDocStore((s) => s.showSidebar);
  const showOutline = useDocStore((s) => s.showOutline);
  const recent = useSettings((s) => s.recentFiles);
  const clearRecent = useSettings((s) => s.clearRecent);

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button onClick={() => newDocument()} title={`新規 (${mod}N)`}>新規</button>
        <button onClick={() => openDocument()} title={`開く (${mod}O)`}>開く</button>
        <Dropdown label="最近" title="最近使ったファイル">
          {(close) => (
            <>
              {recent.length === 0 && <div className="menu-empty">履歴はありません</div>}
              {recent.map((p) => (
                <button key={p} className="menu-item" title={p} onClick={() => { close(); void openDocument(p); }}>
                  <span className="menu-main">{fileName(p)}</span>
                  <span className="menu-sub">{p}</span>
                </button>
              ))}
              {recent.length > 0 && (
                <>
                  <hr />
                  <button className="menu-item" onClick={() => { close(); clearRecent(); }}>履歴を消去</button>
                </>
              )}
            </>
          )}
        </Dropdown>
        <button onClick={() => saveDocument()} title={`保存 (${mod}S)`}>保存</button>
        <Dropdown label="書き出し" title="書き出し">
          {(close) => (
            <>
              <button className="menu-item" onClick={() => { close(); void saveDocumentAs(); }}>名前を付けて保存… <kbd>{mod}{shift}S</kbd></button>
              <button className="menu-item" onClick={() => { close(); void exportHtml(); }}>HTML として書き出す… <kbd>{mod}{shift}H</kbd></button>
              <button className="menu-item" onClick={() => { close(); exportPdf(); }}>印刷 / PDF… <kbd>{mod}P</kbd></button>
            </>
          )}
        </Dropdown>
      </div>

      <div className="toolbar-group">
        <button onClick={() => runInEditor(setHeading(1))} title={`見出し1 (${mod}1)`}>H1</button>
        <button onClick={() => runInEditor(setHeading(2))} title={`見出し2 (${mod}2)`}>H2</button>
        <button onClick={() => runInEditor(setHeading(3))} title={`見出し3 (${mod}3)`}>H3</button>
        <button onClick={() => runInEditor(toggleBold)} title={`太字 (${mod}B)`}><b>B</b></button>
        <button onClick={() => runInEditor(toggleItalic)} title={`斜体 (${mod}I)`}><i>I</i></button>
        <button onClick={() => runInEditor(toggleCode)} title={`コード (${mod}E)`}><code>{"<>"}</code></button>
        <button onClick={() => runInEditor(insertLink)} title={`リンク (${mod}K)`}>🔗</button>
        <Dropdown label="表" title="表の挿入と編集">
          {(close) => (
            <>
              <div className="menu-label">新しい表を挿入</div>
              <TableInsert close={close} />
              <hr />
              <div className="menu-label">カーソル位置の表</div>
              <button className="menu-item" onClick={() => { close(); runInEditor(tableFormat); }}>列幅を整える</button>
              <button className="menu-item" onClick={() => { close(); runInEditor(tableAddRowBelow); }}>下に行を追加</button>
              <button className="menu-item" onClick={() => { close(); runInEditor(tableDeleteRow); }}>この行を削除</button>
              <button className="menu-item" onClick={() => { close(); runInEditor(tableAddColumnRight); }}>右に列を追加</button>
              <button className="menu-item" onClick={() => { close(); runInEditor(tableDeleteColumn); }}>この列を削除</button>
              <button className="menu-item" onClick={() => { close(); runInEditor(tableCycleAlign); }}>列の配置を切替 (左/中央/右)</button>
              <div className="menu-hint">表の中では Tab / Shift+Tab でセルを移動できます。最後のセルで Tab を押すと行が増えます。</div>
            </>
          )}
        </Dropdown>
      </div>

      <div className="toolbar-title" title={doc.path ?? ""}>
        {dirty ? "● " : ""}{fileName(doc.path)}
        {status && <span className="toolbar-status">{status}</span>}
      </div>

      <div className="toolbar-group">
        <button className={showSidebar ? "active" : ""} onClick={() => toggle("showSidebar")} title={`フォルダ (${mod}${shift}E)`}>📁</button>
        <button className={showOutline ? "active" : ""} onClick={() => toggle("showOutline")} title={`アウトライン (${mod}${shift}O)`}>☰</button>
        <button onClick={() => openWorkspace()} title="フォルダを開く…">📂</button>
      </div>
      <div className="toolbar-group segmented">
        {VIEW_MODES.map((v) => (
          <button key={v.mode} className={viewMode === v.mode ? "active" : ""} onClick={() => setViewMode(v.mode)} title={v.title}>
            {v.label}
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <Dropdown label="⋯" title="その他" align="right">
          {(close) => (
            <>
              <button className="menu-item" onClick={() => { close(); toggle("focusMode"); }}>フォーカスモード <kbd>{mod}{shift}F</kbd></button>
              <button className="menu-item" onClick={() => { close(); toggle("typewriterMode"); }}>タイプライターモード <kbd>{mod}{shift}T</kbd></button>
              <hr />
              <button className="menu-item" onClick={() => { close(); toggle("cheatSheetOpen"); }}>チートシート <kbd>F1</kbd></button>
              <button className="menu-item" onClick={() => { close(); toggle("settingsOpen"); }}>設定… <kbd>{mod},</kbd></button>
            </>
          )}
        </Dropdown>
      </div>
    </header>
  );
}
