import { useCallback, useEffect, useRef, useState } from "react";
import { platform } from "../platform";
import type { DirEntry as Entry, SearchHit } from "../platform";
import { revealLine } from "../features/reveal";

/** Focus the workspace search box (Mod+Shift+F). */
export const searchBoxRef: { el: HTMLInputElement | null } = { el: null };
import { useDocStore, fileName, isDirty } from "../store/useDocStore";
import { useSettings } from "../store/useSettings";

/** Paths of open documents with unsaved changes, newline-joined so the selector result is stable. */
const selectDirtyPaths = (s: { docs: { path: string | null; content: string; savedContent: string }[] }) =>
  s.docs
    .filter((d) => d.path != null && isDirty(d as Parameters<typeof isDirty>[0]))
    .map((d) => d.path)
    .join("\n");

function DirtyMark({ show }: { show: boolean }) {
  return show ? <span className="tree-dirty" title="未保存の変更があります">●</span> : null;
}
import { openDocument, openWorkspace } from "../features/files/fileOps";
import { createFileIn, createFolderIn, renamePath, deletePath, childPath } from "../features/files/manage";
import { flashStatus, selectActiveDoc } from "../store/useDocStore";

/** Folders between the workspace root and `path` (root excluded), outermost first; null when `path` is outside. */
export function ancestorDirs(workspace: string, path: string): string[] | null {
  let rel: string;
  if (workspace === "") {
    rel = path;
  } else if (path.startsWith(workspace + "/") || path.startsWith(workspace + "\\")) {
    rel = path.slice(workspace.length + 1);
  } else {
    return null;
  }
  const parts = rel.split(/[\\/]/).filter(Boolean);
  const dirs: string[] = [];
  let cur = workspace;
  for (const name of parts.slice(0, -1)) {
    cur = childPath(cur, name);
    dirs.push(cur);
  }
  return dirs;
}

/**
 * Show the active document in the tree: expand the folders above it, then
 * scroll its row into view and flash it. Rows load asynchronously as folders
 * open, so the row is looked for a few times.
 */
function revealActiveInTree(): boolean {
  const state = useDocStore.getState();
  const doc = selectActiveDoc(state);
  if (state.workspace == null) return false;
  if (doc.path == null) {
    flashStatus("まだ保存されていないドキュメントです");
    return false;
  }
  const dirs = ancestorDirs(state.workspace, doc.path);
  if (dirs === null) {
    flashStatus("このファイルはワークスペースの外にあります");
    return false;
  }
  for (const d of dirs) useSettings.getState().setDirExpanded(d, true);
  const target = doc.path;
  let tries = 0;
  const look = () => {
    const row = Array.from(document.querySelectorAll<HTMLElement>(".sidebar .tree-file")).find(
      (el) => el.title === target,
    );
    if (row) {
      row.scrollIntoView({ block: "center" });
      row.classList.remove("tree-flash");
      void row.offsetWidth; // restart the animation when pressed twice
      row.classList.add("tree-flash");
      return;
    }
    if (++tries < 25) setTimeout(look, 80);
    else flashStatus("ツリーに見つかりませんでした（再読込を試してください）");
  };
  setTimeout(look, 0);
  return true;
}
import { Dropdown } from "./Dropdown";

/** "⋯" menu for a folder (new file / folder inside, rename, delete) or a file (rename, delete). */
function EntryMenu({ path, isDir, isRoot }: { path: string; isDir: boolean; isRoot?: boolean }) {
  return (
    <span className="tree-menu" onClick={(e) => e.stopPropagation()}>
      <Dropdown label="" title="操作" align="right">
        {(close) => (
          <>
            {isDir && (
              <>
                <button className="menu-item" onClick={() => { close(); void createFileIn(path); }}>新規ファイル…</button>
                <button className="menu-item" onClick={() => { close(); void createFolderIn(path); }}>新規フォルダ…</button>
              </>
            )}
            {!isRoot && (
              <>
                {isDir && <hr />}
                <button className="menu-item" onClick={() => { close(); void renamePath(path, isDir); }}>名前の変更…</button>
                <button className="menu-item danger" onClick={() => { close(); void deletePath(path, isDir); }}>削除…</button>
              </>
            )}
          </>
        )}
      </Dropdown>
    </span>
  );
}

/** On phones the sidebar is an overlay; close it once a file was picked. */
function closeIfNarrow() {
  if (window.innerWidth < 768) useDocStore.getState().set({ showSidebar: false });
}

function Node({ entry, depth }: { entry: Entry; depth: number }) {
  // Expansion lives in the settings store, not in this component, so it
  // survives the sidebar being hidden (which unmounts the tree) and restarts.
  const open = useSettings((s) => entry.is_dir && s.expandedDirs.includes(entry.path));
  const setOpen = (next: boolean) => useSettings.getState().setDirExpanded(entry.path, next);
  const [children, setChildren] = useState<Entry[] | null>(null);
  const activePath = useDocStore((s) => s.docs.find((d) => d.id === s.activeId)?.path);
  const treeVersion = useDocStore((s) => s.treeVersion);
  const dirtyPaths = useDocStore(selectDirtyPaths);
  const dirty = dirtyPaths !== "" &&
    dirtyPaths.split("\n").some((p) =>
      entry.is_dir ? p.startsWith(entry.path + "/") || p.startsWith(entry.path + "\\") : p === entry.path,
    );

  const load = useCallback(async () => {
    try {
      setChildren(await platform.readDir(entry.path));
    } catch {
      setChildren([]);
    }
  }, [entry.path]);

  useEffect(() => {
    if (open) void load();
  }, [open, load, treeVersion]);

  if (entry.is_dir) {
    return (
      <li>
        <div className="tree-row">
          <button className="tree-dir" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => setOpen(!open)}>
            <span className="tree-arrow">{open ? "▾" : "▸"}</span> {entry.name}
            <DirtyMark show={dirty} />
          </button>
          <EntryMenu path={entry.path} isDir />
        </div>
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
      <div className="tree-row">
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
          <DirtyMark show={dirty} />
        </button>
        <EntryMenu path={entry.path} isDir={false} />
      </div>
    </li>
  );
}

function SearchResults({ workspace, query }: { workspace: string; query: string }) {
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      platform
        .searchWorkspace(workspace, query)
        .then((h) => {
          if (!cancelled) {
            setHits(h);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setHits([]);
            setError(String(e));
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [workspace, query]);

  if (query.trim().length < 2) return <div className="panel-empty">2 文字以上で検索します</div>;
  if (hits === null) return <div className="panel-empty">検索中…</div>;
  if (error) return <div className="panel-empty">{error}</div>;
  if (hits.length === 0) return <div className="panel-empty">見つかりませんでした</div>;

  const groups = new Map<string, SearchHit[]>();
  for (const h of hits) (groups.get(h.path) ?? groups.set(h.path, []).get(h.path)!).push(h);
  const open = async (h: SearchHit) => {
    await openDocument(h.path);
    revealLine(h.line);
    closeIfNarrow();
  };
  return (
    <ul className="search-results">
      {Array.from(groups.entries()).map(([path, items]) => (
        <li key={path}>
          <div className="search-file" title={path}>{fileName(path)} <span className="search-count">{items.length}</span></div>
          <ul>
            {items.map((h) => (
              <li key={h.line}>
                <button onClick={() => void open(h)} title={`${h.line} 行目`}>
                  <span className="search-line">{h.line}</span> {h.text}
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
      {hits.length >= 500 && <li className="panel-empty">500 件で打ち切りました</li>}
    </ul>
  );
}

export function Sidebar() {
  const workspace = useDocStore((s) => s.workspace);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchBoxRef.el = inputRef.current;
    return () => {
      searchBoxRef.el = null;
    };
  }, []);
  const [root, setRoot] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rootName, setRootName] = useState<string | null>(null);
  const treeVersion = useDocStore((s) => s.treeVersion);

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
    void refresh();
  }, [refresh, treeVersion]);

  return (
    <aside className="sidebar">
      <div className="panel-title">
        <span title={workspace ?? ""}>
          {workspace == null ? "ワークスペース" : workspace === "" ? (rootName ?? "ワークスペース") : fileName(workspace)}
        </span>
        <span className="panel-actions">
          <button
            title="開いているファイルをツリーで表示"
            aria-label="開いているファイルをツリーで表示"
            disabled={workspace == null}
            onClick={() => {
              // The tree is replaced by results while searching; go back to it first.
              if (revealActiveInTree()) setQuery("");
            }}
          >
            ◎
          </button>
          {workspace != null && <EntryMenu path={workspace} isDir isRoot />}
          <button title="再読込" onClick={() => void refresh()} disabled={workspace == null}>↻</button>
          {platform.kind === "tauri" && (
            <button title="別のフォルダを開く…" aria-label="別のフォルダを開く" onClick={() => void openWorkspace()}>📂</button>
          )}
        </span>
      </div>
      {workspace != null && (
        <div className="search-box">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="ワークスペースを検索"
            aria-label="ワークスペースを検索"
          />
        </div>
      )}
      {workspace != null && query ? (
        <SearchResults workspace={workspace} query={query} />
      ) : workspace == null ? (
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
