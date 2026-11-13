import { platform } from "../../platform";
import { useDocStore, fileName, dirName, flashStatus, isDirty } from "../../store/useDocStore";
import { useSettings } from "../../store/useSettings";
import { promptText } from "../../components/PromptDialog";
import { openDocument } from "./fileOps";
import { t, tError } from "../../i18n";

const sep = (dir: string) => (dir.includes("\\") && !dir.includes("/") ? "\\" : "/");
/** Join a directory and a name; "" is the web-mode root. */
export function childPath(dir: string, name: string): string {
  if (dir === "") return name;
  const s = sep(dir);
  return dir.endsWith(s) ? dir + name : dir + s + name;
}

const INVALID = /[\\/:*?"<>|]/;
function validName(name: string): string | null {
  if (INVALID.test(name)) return t("名前に \\ / : * ? \" < > | は使えません");
  if (name === "." || name === "..") return t("その名前は使えません");
  if (name.startsWith(".")) return t("ドットで始まる名前は一覧に表示されません");
  return null;
}

function bumpTree() {
  useDocStore.setState((s) => ({ treeVersion: s.treeVersion + 1 }));
}

/** Show the folder something was just created in (the workspace root is always shown). */
function expand(dir: string) {
  if (dir !== useDocStore.getState().workspace) useSettings.getState().setDirExpanded(dir, true);
}

function isWithin(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir + "/") || path.startsWith(dir + "\\");
}

/** Create an empty Markdown file in `dir` and open it. */
export async function createFileIn(dir: string): Promise<void> {
  const name = await promptText({ title: t("新規ファイル"), label: t("ファイル名"), defaultValue: "untitled.md", okLabel: t("作成"), validate: validName });
  if (!name) return;
  const withExt = /\.[A-Za-z0-9]+$/.test(name) ? name : `${name}.md`;
  const path = childPath(dir, withExt);
  try {
    await platform.writeFile(path, "");
    expand(dir);
    bumpTree();
    await openDocument(path);
  } catch (e) {
    await platform.message(tError(e), { title: t("作成できませんでした"), kind: "error" });
  }
}

export async function createFolderIn(dir: string): Promise<void> {
  const name = await promptText({ title: t("新規フォルダ"), label: t("フォルダ名"), defaultValue: t("新しいフォルダ"), okLabel: t("作成"), validate: validName });
  if (!name) return;
  try {
    await platform.createDir(childPath(dir, name));
    expand(dir);
    bumpTree();
  } catch (e) {
    await platform.message(tError(e), { title: t("作成できませんでした"), kind: "error" });
  }
}

/** Rename a file or folder in place; open tabs and the recent list follow. */
export async function renamePath(path: string, isDir: boolean): Promise<void> {
  const oldName = fileName(path);
  const name = await promptText({ title: isDir ? t("フォルダ名の変更") : t("ファイル名の変更"), defaultValue: oldName, okLabel: t("変更"), validate: validName });
  if (!name || name === oldName) return;
  const target = childPath(dirName(path), name);
  try {
    await platform.rename(path, target);
  } catch (e) {
    await platform.message(tError(e), { title: t("名前を変更できませんでした"), kind: "error" });
    return;
  }
  const remap = (p: string | null) => {
    if (p == null) return p;
    if (p === path) return target;
    if (isDir && isWithin(p, path)) return target + p.slice(path.length);
    return p;
  };
  useDocStore.setState((s) => ({
    docs: s.docs.map((d) => (d.path != null && remap(d.path) !== d.path ? { ...d, path: remap(d.path) } : d)),
    workspace: s.workspace != null ? remap(s.workspace) : s.workspace,
  }));
  const settings = useSettings.getState();
  settings.update({
    recentFiles: settings.recentFiles.map((p) => remap(p) as string),
    expandedDirs: settings.expandedDirs.map((p) => remap(p) as string),
  });
  bumpTree();
  flashStatus(t("「{0}」を「{1}」に変更しました", oldName, name));
}

/** Delete (desktop: trash) a file or folder after confirmation; affected tabs become untitled. */
export async function deletePath(path: string, isDir: boolean): Promise<void> {
  const name = fileName(path);
  // Whole sentences per case: fragments glued together do not translate.
  const question = platform.deleteIsTrash
    ? isDir
      ? t("フォルダ「{0}」（中身も含む）をゴミ箱に移動します。よろしいですか？", name)
      : t("ファイル「{0}」をゴミ箱に移動します。よろしいですか？", name)
    : isDir
      ? t("フォルダ「{0}」（中身も含む）を完全に削除します。元に戻せません。よろしいですか？", name)
      : t("ファイル「{0}」を完全に削除します。元に戻せません。よろしいですか？", name);
  const ok = await platform.ask(question, {
    title: t("削除"),
    kind: "warning",
    okLabel: platform.deleteIsTrash ? t("ゴミ箱へ") : t("削除する"),
    cancelLabel: t("キャンセル"),
    danger: true,
  });
  if (!ok) return;
  try {
    await platform.deletePath(path);
  } catch (e) {
    await platform.message(tError(e), { title: t("削除できませんでした"), kind: "error" });
    return;
  }
  const affected = (p: string | null) => p != null && (p === path || (isDir && isWithin(p, path)));
  useDocStore.setState((s) => ({
    // Keep the text in the tab (as an unsaved document) so nothing typed is lost.
    docs: s.docs.map((d) => (affected(d.path) ? { ...d, path: null, mtime: null, savedContent: isDirty(d) ? d.savedContent : "" } : d)),
  }));
  const settings = useSettings.getState();
  settings.update({
    recentFiles: settings.recentFiles.filter((p) => !affected(p)),
    expandedDirs: settings.expandedDirs.filter((p) => !affected(p)),
  });
  bumpTree();
  flashStatus(platform.deleteIsTrash ? t("「{0}」をゴミ箱に移動しました", name) : t("「{0}」を削除しました", name));
}
