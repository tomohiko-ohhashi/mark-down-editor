import { useEffect, useState } from "react";
import { create } from "zustand";
import { platform } from "../platform";
import type { DirEntry } from "../platform";
import { dirName, fileName } from "../store/useDocStore";
import { t, tError } from "../i18n";
import { isImagePath } from "../preview/paths";

interface PickerRequest {
  mode: "open" | "save";
  defaultPath?: string;
  extensions?: string[];
}

interface PickerState {
  request: PickerRequest | null;
  resolve: ((path: string | null) => void) | null;
}

const usePickerStore = create<PickerState>(() => ({ request: null, resolve: null }));

/**
 * In-app replacement for the OS open/save dialogs (web mode). Resolves with
 * the chosen root-relative path, or null when cancelled.
 */
export function openPicker(request: PickerRequest): Promise<string | null> {
  return new Promise((resolve) => {
    usePickerStore.getState().resolve?.(null); // cancel a previous one
    usePickerStore.setState({ request, resolve });
  });
}

function finish(path: string | null) {
  const { resolve } = usePickerStore.getState();
  usePickerStore.setState({ request: null, resolve: null });
  resolve?.(path);
}

export function FilePicker() {
  const request = usePickerStore((s) => s.request);
  const [dir, setDir] = useState("");
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) return;
    const def = request.defaultPath ?? "";
    const d = def.includes("/") ? dirName(def) : "";
    setDir(d === def ? "" : d);
    setName(request.mode === "save" ? fileName(def === "" ? "untitled.md" : def) : "");
    setError(null);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    setEntries(null);
    platform
      .readDir(dir)
      .then((e) => {
        // The tree also lists images; only folders and documents can be opened or overwritten here.
        if (!cancelled) setEntries(e.filter((x) => x.is_dir || !isImagePath(x.path)));
      })
      .catch((e) => {
        if (!cancelled) {
          setEntries([]);
          setError(tError(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [request, dir]);

  if (!request) return null;

  const crumbs = dir ? dir.split("/") : [];
  const join = (a: string, b: string) => (a ? `${a}/${b}` : b);
  const ext = request.extensions?.[0];
  const submitSave = () => {
    let n = name.trim();
    if (!n) return;
    if (ext && ext !== "*" && !/\.[A-Za-z0-9]+$/.test(n)) n += `.${ext}`;
    if (/[\\/]/.test(n)) {
      setError(t("ファイル名にスラッシュは使えません"));
      return;
    }
    const target = join(dir, n);
    const exists = entries?.some((e) => !e.is_dir && e.name === n);
    if (exists && !window.confirm(t("「{0}」は既にあります。上書きしますか？", n))) return;
    finish(target);
  };

  return (
    <div className="modal-backdrop" onMouseDown={() => finish(null)}>
      <div className="modal picker" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="modal-header">
          <h2>{request.mode === "open" ? t("ファイルを開く") : t("名前を付けて保存")}</h2>
          <button onClick={() => finish(null)} title={t("閉じる")}>×</button>
        </div>
        <div className="picker-crumbs">
          <button onClick={() => setDir("")}>🏠</button>
          {crumbs.map((c, i) => (
            <span key={i}>
              <span className="sep">/</span>
              <button onClick={() => setDir(crumbs.slice(0, i + 1).join("/"))}>{c}</button>
            </span>
          ))}
        </div>
        <ul className="picker-list">
          {entries === null && <li className="panel-empty">{t("読み込み中…")}</li>}
          {error && <li className="panel-empty">{error}</li>}
          {entries?.map((e) => (
            <li key={e.path}>
              <button
                className={e.is_dir ? "picker-dir" : "picker-file"}
                onClick={() => {
                  if (e.is_dir) setDir(e.path);
                  else if (request.mode === "open") finish(e.path);
                  else setName(e.name);
                }}
              >
                {e.is_dir ? "📁" : "📄"} {e.name}
              </button>
            </li>
          ))}
          {entries && entries.length === 0 && !error && <li className="panel-empty">{t("(空のフォルダ)")}</li>}
        </ul>
        {request.mode === "save" && (
          <div className="picker-save">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSave();
              }}
              placeholder={t("ファイル名")}
              autoFocus
            />
            <button className="primary" onClick={submitSave}>{t("保存")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
