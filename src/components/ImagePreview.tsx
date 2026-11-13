import { useEffect } from "react";
import { create } from "zustand";
import { platform } from "../platform";
import { useDocStore, selectActiveDoc, fileName, dirName, flashStatus } from "../store/useDocStore";
import { editorRef } from "../editor/Editor";
import { relativePath, linkPath } from "../preview/paths";
import { t } from "../i18n";

const useImageStore = create<{ path: string | null }>(() => ({ path: null }));

/** Show an image file from the workspace tree, with a button to insert it into the document. */
export function showImage(path: string): void {
  useImageStore.setState({ path });
}

export function ImagePreview() {
  const path = useImageStore((s) => s.path);
  const doc = useDocStore(selectActiveDoc);
  const open = path != null;
  // Esc closes it wherever the focus is (the insert button may be disabled), before anything behind it reacts.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      useImageStore.setState({ path: null });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  if (!path) return null;
  const close = () => useImageStore.setState({ path: null });
  const insert = () => {
    const view = editorRef.view;
    if (!view || !doc.path) return;
    const link = `![${fileName(path).replace(/\.\w+$/, "")}](${linkPath(relativePath(dirName(doc.path), path))})`;
    const { from, to } = view.state.selection.main;
    view.dispatch({ changes: { from, to, insert: link }, selection: { anchor: from + link.length }, userEvent: "input" });
    close();
    view.focus();
    flashStatus(t("画像を挿入しました"));
  };
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal image-preview" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={fileName(path)}>
        <div className="modal-header">
          <h2>{fileName(path)}</h2>
          <button onClick={close} title={t("閉じる")}>×</button>
        </div>
        <div className="image-preview-body">
          <img src={platform.assetUrl(path)} alt={fileName(path)} />
        </div>
        <div className="modal-footer">
          <span className="modal-footer-note">{doc.path ? "" : t("挿入するには、先にドキュメントを保存してください")}</span>
          <button className="secondary" onClick={close}>{t("閉じる")}</button>
          <button className="primary" onClick={insert} disabled={!doc.path} autoFocus>
            {t("ドキュメントに挿入")}
          </button>
        </div>
      </div>
    </div>
  );
}
