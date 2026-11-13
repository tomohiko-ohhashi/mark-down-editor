import { platform } from "../../platform";
import {
  useDocStore,
  isDirty,
  diskText,
  fileName,
  flashStatus,
  selectActiveDoc,
  type Doc,
} from "../../store/useDocStore";
import { useSettings } from "../../store/useSettings";
import { choose } from "../../components/ConfirmDialog";
import { suggestFileName } from "./names";
import { joinPath } from "../../preview/paths";

const { readFile, writeFile, fileMtime, ask, message } = platform;
export { readFile, writeFile, fileMtime };

function docById(id: string): Doc | undefined {
  return useDocStore.getState().docs.find((d) => d.id === id);
}

/**
 * Ask the user what to do with unsaved changes in one document.
 * Resolves true if it is safe to proceed (saved or discarded), false if cancelled.
 */
export async function confirmDiscardChanges(doc: Doc): Promise<boolean> {
  if (!isDirty(doc)) return true;
  const answer = await choose({
    title: "未保存の変更",
    message: `「${fileName(doc.path)}」には保存されていない変更があります。保存しますか？`,
    choices: [
      { id: "cancel", label: "キャンセル" },
      { id: "discard", label: "保存しない", kind: "danger" },
      { id: "save", label: "保存する", kind: "primary" },
    ],
  });
  if (answer === "save") return saveDocument(doc.id);
  return answer === "discard";
}

/** Confirm every dirty document (used before quitting). */
export async function confirmDiscardAll(): Promise<boolean> {
  for (const doc of useDocStore.getState().docs) {
    if (!isDirty(doc)) continue;
    useDocStore.getState().setActive(doc.id);
    if (!(await confirmDiscardChanges(doc))) return false;
  }
  return true;
}

export function newDocument(): void {
  useDocStore.getState().addDoc();
}

/** Open a file into a tab. Reuses the active tab when it is an empty, untitled, clean document. */
export async function openDocument(presetPath?: string, opts: { silent?: boolean } = {}): Promise<void> {
  const path = presetPath ?? (await platform.pickOpenPath());
  if (!path) return;

  const existing = useDocStore.getState().docs.find((d) => d.path === path);
  if (existing) {
    useDocStore.getState().setActive(existing.id);
    return;
  }

  try {
    const file = await readFile(path);
    // Re-read the store: another open may have finished (or the user typed) while reading.
    const state = useDocStore.getState();
    const already = state.docs.find((d) => d.path === path);
    if (already) {
      state.setActive(already.id);
      return;
    }
    const active = selectActiveDoc(state);
    if (!active.path && active.content === "" && !isDirty(active)) {
      state.loadInto(active.id, path, file.content, file.mtime);
    } else {
      state.addDoc({ path, content: file.content, mtime: file.mtime });
    }
    useSettings.getState().addRecent(path);
  } catch (e) {
    // Restoring the last session: a file that has gone away is not worth a dialog.
    if (!opts.silent) await message(String(e), { title: "開けませんでした", kind: "error" });
    const s = useSettings.getState();
    s.update({ recentFiles: s.recentFiles.filter((p) => p !== path) });
  }
}

export async function closeDocument(id?: string): Promise<void> {
  const state = useDocStore.getState();
  const doc = id ? docById(id) : selectActiveDoc(state);
  if (!doc) return;
  if (isDirty(doc)) {
    state.setActive(doc.id);
    if (!(await confirmDiscardChanges(doc))) return;
  }
  useDocStore.getState().removeDoc(doc.id);
}

export async function saveDocument(id?: string): Promise<boolean> {
  const doc = id ? docById(id) : selectActiveDoc(useDocStore.getState());
  if (!doc) return false;
  if (!doc.path) return saveDocumentAs(doc.id);
  return writeTo(doc.id, doc.path);
}

export async function saveDocumentAs(id?: string): Promise<boolean> {
  const doc = id ? docById(id) : selectActiveDoc(useDocStore.getState());
  if (!doc) return false;
  // A new document: propose a name from its first heading, in the workspace folder if one is open.
  let proposal = doc.path;
  if (!proposal) {
    const name = suggestFileName(doc.content);
    const workspace = useDocStore.getState().workspace;
    proposal = platform.kind === "tauri" && workspace ? joinPath(workspace, name) : name;
  }
  const path = await platform.pickSavePath(proposal);
  if (!path) return false;
  return writeTo(doc.id, path);
}

async function writeTo(id: string, path: string): Promise<boolean> {
  const doc = docById(id);
  if (!doc) return false;
  const written = doc.content;
  try {
    const mtime = await writeFile(path, diskText(doc));
    useDocStore.getState().markSaved(id, path, mtime, written);
    useSettings.getState().addRecent(path);
    flashStatus("保存しました");
    return true;
  } catch (e) {
    await message(String(e), { title: "保存できませんでした", kind: "error" });
    return false;
  }
}

/** Save every dirty document that already has a path (autosave). */
export async function autosaveAll(): Promise<void> {
  for (const doc of useDocStore.getState().docs) {
    if (doc.path && isDirty(doc)) {
      const written = doc.content;
      try {
        const mtime = await writeFile(doc.path, diskText(doc));
        useDocStore.getState().markSaved(doc.id, doc.path, mtime, written);
      } catch {
        /* reported on the next manual save */
      }
    }
  }
}

let checkingExternal = false;

/** Reload documents that were changed on disk by another program. */
export async function checkExternalChanges(): Promise<void> {
  if (checkingExternal) return;
  checkingExternal = true;
  try {
    for (const doc of useDocStore.getState().docs) {
      if (!doc.path || doc.mtime == null) continue;
      let mtime: number;
      try {
        mtime = await fileMtime(doc.path);
      } catch {
        continue; // removed or inaccessible; leave the buffer alone
      }
      if (mtime === doc.mtime) continue;

      if (!isDirty(doc)) {
        const file = await readFile(doc.path);
        useDocStore.getState().loadInto(doc.id, doc.path, file.content, file.mtime);
        flashStatus(`「${fileName(doc.path)}」の外部の変更を読み込みました`);
        continue;
      }

      // Record the mtime first so the dialog is not shown repeatedly.
      useDocStore.setState((s) => ({
        docs: s.docs.map((d) => (d.id === doc.id ? { ...d, mtime } : d)),
      }));
      useDocStore.getState().setActive(doc.id);
      const reload = await ask(
        `「${fileName(doc.path)}」は別のプログラムによって変更されました。再読込しますか？\n未保存の変更は失われます。`,
        { title: "ファイルが変更されました", kind: "warning", okLabel: "再読込", cancelLabel: "そのまま" },
      );
      if (reload) {
        const file = await readFile(doc.path);
        useDocStore.getState().loadInto(doc.id, doc.path, file.content, file.mtime);
      }
    }
  } finally {
    checkingExternal = false;
  }
}

export async function openWorkspace(presetPath?: string): Promise<void> {
  const path = presetPath ?? (await platform.pickDirectory());
  if (path == null) return;
  useDocStore.getState().set({ workspace: path, showSidebar: true });
  const settings = useSettings.getState();
  settings.update(settings.lastWorkspace === path ? { lastWorkspace: path } : { lastWorkspace: path, expandedDirs: [] });
}
