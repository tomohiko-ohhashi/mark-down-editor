import { useCallback, useEffect, useRef, useState } from "react";
import { platform } from "../platform";
import type { DirEntry as Entry, SearchHit } from "../platform";
import { goToLine } from "../editor/Editor";

/** Focus the workspace search box (Mod+Shift+F). */
export const searchBoxRef: { el: HTMLInputElement | null } = { el: null };
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
    goToLine(h.line);
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
