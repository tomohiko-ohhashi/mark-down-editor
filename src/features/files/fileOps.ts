import { invoke } from "@tauri-apps/api/core";
import { open, save, ask, message } from "@tauri-apps/plugin-dialog";
import { useDocStore, selectIsDirty, fileName } from "../../store/useDocStore";

interface FileContent {
  content: string;
  mtime: number;
}

const MD_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
  { name: "テキスト", extensions: ["txt"] },
  { name: "すべてのファイル", extensions: ["*"] },
];

export async function readFile(path: string): Promise<FileContent> {
  return invoke<FileContent>("read_file", { path });
}

export async function writeFile(path: string, content: string): Promise<number> {
  return invoke<number>("write_file", { path, content });
}

export async function fileMtime(path: string): Promise<number> {
  return invoke<number>("file_mtime", { path });
}

/**
 * Ask the user what to do with unsaved changes.
 * Resolves true if it is safe to proceed (saved or discarded), false if cancelled.
 */
export async function confirmDiscardChanges(): Promise<boolean> {
  const s = useDocStore.getState();
  if (!selectIsDirty(s)) return true;
  const wantSave = await ask(
    `「${fileName(s.path)}」には保存されていない変更があります。保存しますか？`,
    { title: "未保存の変更", kind: "warning", okLabel: "保存する", cancelLabel: "保存しない" },
  );
  if (wantSave) return saveDocument();
  return ask("変更を破棄してもよいですか？", {
    title: "確認",
    kind: "warning",
    okLabel: "破棄する",
    cancelLabel: "キャンセル",
  });
}

export async function newDocument(): Promise<void> {
  if (!(await confirmDiscardChanges())) return;
  useDocStore.getState().loadDocument(null, "", null);
}

export async function openDocument(presetPath?: string): Promise<void> {
  if (!(await confirmDiscardChanges())) return;
  const path =
    presetPath ??
    (await open({ multiple: false, directory: false, filters: MD_FILTERS }));
  if (!path) return;
  try {
    const file = await readFile(path);
    useDocStore.getState().loadDocument(path, file.content, file.mtime);
  } catch (e) {
    await message(String(e), { title: "開けませんでした", kind: "error" });
  }
}

export async function saveDocument(): Promise<boolean> {
  const s = useDocStore.getState();
  if (!s.path) return saveDocumentAs();
  return writeTo(s.path);
}

export async function saveDocumentAs(): Promise<boolean> {
  const s = useDocStore.getState();
  const path = await save({
    defaultPath: s.path ?? "untitled.md",
    filters: MD_FILTERS,
  });
  if (!path) return false;
  return writeTo(path);
}

async function writeTo(path: string): Promise<boolean> {
  const s = useDocStore.getState();
  try {
    const mtime = await writeFile(path, s.content);
    s.markSaved(path, mtime);
    s.setStatus("保存しました");
    setTimeout(() => useDocStore.getState().setStatus(null), 2000);
    return true;
  } catch (e) {
    await message(String(e), { title: "保存できませんでした", kind: "error" });
    return false;
  }
}

/** Reload the current file from disk if it was changed by another program. */
export async function checkExternalChange(): Promise<void> {
  const s = useDocStore.getState();
  if (!s.path || s.mtime == null) return;
  let mtime: number;
  try {
    mtime = await fileMtime(s.path);
  } catch {
    return; // file removed or inaccessible; leave the buffer alone
  }
  if (mtime === s.mtime) return;

  if (!selectIsDirty(s)) {
    const file = await readFile(s.path);
    s.loadDocument(s.path, file.content, file.mtime);
    s.setStatus("外部の変更を読み込みました");
    setTimeout(() => useDocStore.getState().setStatus(null), 2000);
    return;
  }

  // Record the mtime first so the dialog is not shown repeatedly.
  useDocStore.setState({ mtime });
  const reload = await ask(
    "このファイルは別のプログラムによって変更されました。再読込しますか？\n未保存の変更は失われます。",
    { title: "ファイルが変更されました", kind: "warning", okLabel: "再読込", cancelLabel: "そのまま" },
  );
  if (reload) {
    const file = await readFile(s.path);
    useDocStore.getState().loadDocument(s.path, file.content, file.mtime);
  }
}
