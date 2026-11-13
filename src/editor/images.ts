import type { EditorView } from "@codemirror/view";
import { platform } from "../platform";
import { useDocStore, selectActiveDoc } from "../store/useDocStore";
import { saveDocument } from "../features/files/fileOps";

function imageFiles(list: DataTransfer | null): File[] {
  if (!list) return [];
  return Array.from(list.files).filter((f) => f.type.startsWith("image/"));
}

/**
 * Save dropped/pasted image files next to the document and insert Markdown
 * image links at the cursor. Returns true when the event was handled.
 */
/** Images are stored next to the document, so it needs a location first. Returns its path, or null. */
async function savedDocPath(): Promise<string | null> {
  let doc = selectActiveDoc(useDocStore.getState());
  if (!doc.path) {
    await platform.message("画像を保存するには、先にこのドキュメントを保存してください。", {
      title: "画像の挿入",
      kind: "info",
    });
    if (!(await saveDocument(doc.id))) return null;
    doc = selectActiveDoc(useDocStore.getState());
  }
  return doc.path;
}

function insertLinks(view: EditorView, links: string[]) {
  if (links.length === 0) return;
  const { from, to } = view.state.selection.main;
  const insert = links.join("\n");
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    userEvent: "input.paste",
  });
  view.focus();
}

const altText = (name: string) => (name && !/^image\.\w+$/i.test(name) ? name.replace(/\.\w+$/, "") : "image");

/** Desktop: image files dropped onto the window arrive as paths; copy them next to the document. */
export async function insertImagePaths(view: EditorView, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const docPath = await savedDocPath();
  if (!docPath) return;
  const links: string[] = [];
  for (const source of paths) {
    try {
      const rel = await platform.importImage(docPath, source);
      const name = source.split(/[\\/]/).pop() ?? "";
      links.push(`![${altText(name)}](${encodeURI(rel)})`);
    } catch (e) {
      await platform.message(String(e), { title: "画像を保存できませんでした", kind: "error" });
    }
  }
  insertLinks(view, links);
}

export async function insertImages(view: EditorView, files: File[]): Promise<boolean> {
  if (files.length === 0) return false;
  const docPath = await savedDocPath();
  if (!docPath) return true;
  const links: string[] = [];
  for (const file of files) {
    const ext = (file.name.split(".").pop() || file.type.split("/")[1] || "png").toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const rel = await platform.saveImage(docPath, bytes, ext);
      links.push(`![${altText(file.name)}](${encodeURI(rel)})`);
    } catch (e) {
      await platform.message(String(e), { title: "画像を保存できませんでした", kind: "error" });
    }
  }
  insertLinks(view, links);
  return true;
}

export function handlePaste(event: ClipboardEvent, view: EditorView): boolean {
  const files = imageFiles(event.clipboardData);
  if (files.length === 0) return false;
  event.preventDefault();
  void insertImages(view, files);
  return true;
}

export function handleDrop(event: DragEvent, view: EditorView): boolean {
  const files = imageFiles(event.dataTransfer);
  if (files.length === 0) return false;
  event.preventDefault();
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos != null) view.dispatch({ selection: { anchor: pos } });
  void insertImages(view, files);
  return true;
}
