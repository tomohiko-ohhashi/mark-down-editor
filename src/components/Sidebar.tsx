import { useCallback, useEffect, useState } from "react";
import { platform } from "../platform";
import type { DirEntry as Entry } from "../platform";
import { useDocStore, fileName } from "../store/useDocStore";
import { openDocument, openWorkspace } from "../features/files/fileOps";

/** On phones the sidebar is an overlay; close it once a file was picked. */
function closeIfNarrow() {
  if (window.innerWidth < 768) useDocStore.getState().set({ showSidebar: false });
}

function Node({ entry, depth }: { entry: Entry; depth: number }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<Entry[] | null>(null);
  const activePath = useDocStore((s) => s.docs.find((d) => d.id === s.activeId)?.path);

  const load = useCallback(async () => {
    try {
      setChildren(await platform.readDir(entry.path));
    } catch {
      setChildren([]);
    }
  }, [entry.path]);

  useEffect(() => {
    if (open && children === null) void load();
  }, [open, children, load]);

  if (entry.is_dir) {
    return (
      <li>
        <button className="tree-dir" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => setOpen((o) => !o)}>
          <span className="tree-arrow">{open ? "▾" : "▸"}</span> {entry.name}
        </button>
        {open && children && (
          <ul>
            {children.map((c) => (
              <Node key={c.path} entry={c} depth={depth + 1} />
            ))}
            {children.length === 0 && (
              <li className="panel-empty" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
                (空)
              </li>
            )}
          </ul>
        )}
      </li>
    );
  }
  return (
    <li>
      <button
        className={`tree-file ${activePath === entry.path ? "active" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 + 14 }}
        onClick={() => {
          void openDocument(entry.path);
          closeIfNarrow();
        }}
        title={entry.path}
      >
        {entry.name}
      </button>
    </li>
  );
}

export function Sidebar() {
  const workspace = useDocStore((s) => s.workspace);
  const [root, setRoot] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rootName, setRootName] = useState<string | null>(null);

  useEffect(() => {
    platform.rootName().then(setRootName).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    if (workspace == null) return;
    try {
      setRoot(await platform.readDir(workspace));
      setError(null);
    } catch (e) {
      setRoot([]);
      setError(String(e));
    }
  }, [workspace]);

  useEffect(() => {
    setRoot(null);
    void refresh();
  }, [refresh]);

  return (
    <aside className="sidebar">
      <div className="panel-title">
        <span title={workspace ?? ""}>
          {workspace == null ? "ワークスペース" : workspace === "" ? (rootName ?? "ワークスペース") : fileName(workspace)}
        </span>
        <span className="panel-actions">
          <button title="再読込" onClick={() => void refresh()} disabled={workspace == null}>↻</button>
          {platform.kind === "tauri" && (
            <button title="フォルダを開く" onClick={() => void openWorkspace()}>📂</button>
          )}
        </span>
      </div>
      {workspace == null ? (
        <div className="panel-empty">
          フォルダを開くと、Markdown ファイルの一覧が表示されます。
          <br />
          <button className="link" onClick={() => void openWorkspace()}>フォルダを開く…</button>
        </div>
      ) : error ? (
        <div className="panel-empty">{error}</div>
      ) : root === null ? (
        <div className="panel-empty">読み込み中…</div>
      ) : (
        <ul className="tree">
          {root.map((e) => (
            <Node key={e.path} entry={e} depth={0} />
          ))}
          {root.length === 0 && <li className="panel-empty">Markdown ファイルがありません</li>}
        </ul>
      )}
    </aside>
  );
}
