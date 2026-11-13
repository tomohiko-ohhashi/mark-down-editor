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
import { firstOpenedText } from "../diff";

/** Start of the error the back end gives when the text does not fit the file's encoding. */
const CANNOT_ENCODE = "この文字コードでは保存できない文字が含まれています";
import { joinPath } from "../../preview/paths";
import { t, tError } from "../../i18n";

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
    title: t("未保存の変更"),
    message: t("「{0}」には保存されていない変更があります。保存しますか？", fileName(doc.path)),
    choices: [
      { id: "cancel", label: t("キャンセル") },
      { id: "discard", label: t("保存しない"), kind: "danger" },
      { id: "save", label: t("保存する"), kind: "primary" },
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
  let path = presetPath ?? (await platform.pickOpenPath());
  if (!path) return;
  // In the browser every path is relative to the shared folder; "/c.md" (a link written as an
  // absolute path) and "c.md" are the same file and must not end up in two tabs.
  if (platform.kind === "web") path = path.replace(/^(\.?[\\/])+/, "");
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
    // What the changes view compares against: the text at the first open in this run.
    const original = firstOpenedText(path, file.content);
    if (!active.path && active.content === "" && !isDirty(active)) {
      state.loadInto(active.id, path, file.content, file.mtime, file.encoding);
      state.setOriginal(active.id, original);
    } else {
      state.addDoc({ path, content: file.content, mtime: file.mtime, originalContent: original, encoding: file.encoding });
    }
    useSettings.getState().addRecent(path);
  } catch (e) {
    // Restoring the last session: a file that has gone away is not worth a dialog.
    if (!opts.silent) await message(tError(e), { title: t("開けませんでした"), kind: "error" });
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
  // Nothing changed: leave the file alone. Writing it again could still alter it
  // (a file with mixed line endings is written back with one kind).
  if (!isDirty(doc)) {
    let onDisk = true;
    try {
      await fileMtime(doc.path);
    } catch {
      onDisk = false; // deleted meanwhile: saving puts it back
    }
    if (onDisk) {
      flashStatus(t("変更はありません"));
      return true;
    }
  }
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

/** True when the file was changed on disk after this document last read or wrote it. */
async function changedOnDisk(doc: Doc, path: string): Promise<boolean> {
  if (doc.path !== path || doc.mtime == null) return false;
  try {
    return (await fileMtime(path)) !== doc.mtime;
  } catch {
    return false; // gone or unreadable: saving recreates it
  }
}

async function writeTo(id: string, path: string): Promise<boolean> {
  const doc = docById(id);
  if (!doc) return false;
  const written = doc.content;
  // Another program may have written the file since it was opened; saving would silently undo that.
  if (await changedOnDisk(doc, path)) {
    const overwrite = await ask(
      t("「{0}」は、開いたあとに別のプログラムによって変更されています。上書きして保存しますか？", fileName(path)),
      { title: t("ファイルが変更されています"), kind: "warning", okLabel: t("上書きする"), cancelLabel: t("キャンセル") },
    );
    if (!overwrite) return false;
  }
  let encoding = doc.encoding;
  for (;;) {
    try {
      const mtime = await writeFile(path, diskText(doc), encoding);
      useDocStore.getState().markSaved(id, path, mtime, written);
      // Saved under the name of a file that is open in another tab: that tab now shows what is
      // no longer on disk. It is closed, or, with unsaved text in it, kept as an untitled document.
      for (const other of useDocStore.getState().docs) {
        if (other.id === id || other.path !== path) continue;
        if (isDirty(other)) {
          useDocStore.setState((s) => ({ docs: s.docs.map((d) => (d.id === other.id ? { ...d, path: null, mtime: null } : d)) }));
        } else {
          useDocStore.getState().removeDoc(other.id);
        }
      }
      if (encoding !== doc.encoding) {
        useDocStore.setState((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, encoding } : d)) }));
      }
      noteAutosave(id, null);
      useSettings.getState().addRecent(path);
      flashStatus(t("保存しました"));
      return true;
    } catch (e) {
      // The file's own encoding (Shift_JIS ...) cannot hold a character that was typed: offer UTF-8.
      if (encoding !== "UTF-8" && String(e).includes(CANNOT_ENCODE)) {
        const asUtf8 = await ask(
          t("「{0}」の文字コード ({1}) では保存できない文字が含まれています。UTF-8 に変換して保存しますか？", fileName(path), encoding),
          { title: t("文字コード"), kind: "warning", okLabel: t("UTF-8 で保存"), cancelLabel: t("キャンセル") },
        );
        if (!asUtf8) return false;
        encoding = "UTF-8";
        continue;
      }
      await message(tError(e), { title: t("保存できませんでした"), kind: "error" });
      return false;
    }
  }
}

/** Remember (or forget, with null) that the autosave could not write a document. */
function noteAutosave(id: string, problem: string | null): void {
  useDocStore.setState((s) => {
    if ((s.autosaveErrors[id] ?? null) === problem) return {};
    const next = { ...s.autosaveErrors };
    if (problem == null) delete next[id];
    else next[id] = problem;
    return { autosaveErrors: next };
  });
}

/** Save every dirty document that already has a path (autosave). */
export async function autosaveAll(): Promise<void> {
  for (const doc of useDocStore.getState().docs) {
    if (doc.path && isDirty(doc)) {
      // Never overwrite another program's changes without asking; the external-change check will ask.
      if (await changedOnDisk(doc, doc.path)) continue;
      // The check took a moment: save what the document is now (it may have been saved, renamed or closed).
      const now = docById(doc.id);
      if (!now || now.path !== doc.path || !isDirty(now)) continue;
      const written = now.content;
      try {
        const mtime = await writeFile(doc.path, diskText(now), now.encoding);
        useDocStore.getState().markSaved(doc.id, doc.path, mtime, written);
        noteAutosave(doc.id, null);
      } catch (e) {
        // Keep telling the user for as long as it fails; nothing is saved meanwhile.
        noteAutosave(doc.id, `${fileName(doc.path)}: ${tError(e)}`);
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

      // A file that cannot be read (now) is left alone; the other tabs are still checked.
      const read = () => readFile(doc.path as string).catch(() => null);
      if (!isDirty(doc)) {
        const file = await read();
        // Something was typed while the file was being read: do not throw it away; the next check asks.
        const now = docById(doc.id);
        if (!file || !now || now.path !== doc.path || now.content !== doc.content) continue;
        useDocStore.getState().loadInto(doc.id, doc.path, file.content, file.mtime, file.encoding);
        flashStatus(t("「{0}」の外部の変更を読み込みました", fileName(doc.path)));
        continue;
      }

      useDocStore.getState().setActive(doc.id);
      // The recorded time stays as it is while the question is open, so the autosave keeps its
      // hands off the file until there is an answer.
      const reload = await ask(
        t("「{0}」は別のプログラムによって変更されました。再読込しますか？\n未保存の変更は失われます。", fileName(doc.path)),
        { title: t("ファイルが変更されました"), kind: "warning", okLabel: t("再読込"), cancelLabel: t("そのまま") },
      );
      const file = reload ? await read() : null;
      if (file) {
        useDocStore.getState().loadInto(doc.id, doc.path, file.content, file.mtime, file.encoding);
      } else {
        // "Keep mine": remember the file's time, so this change is not asked about again
        // and a save writes the kept text.
        useDocStore.setState((s) => ({ docs: s.docs.map((d) => (d.id === doc.id ? { ...d, mtime } : d)) }));
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
