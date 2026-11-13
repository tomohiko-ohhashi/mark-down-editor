import { EditorView } from "@codemirror/view";
import { platform } from "../../platform";
import { editorRef } from "../../editor/Editor";
import { insertImagePaths } from "../../editor/images";
import { openDocument, openWorkspace } from "./fileOps";

export type DroppedKind = "markdown" | "image" | "other";

/** What a file dragged onto the window is, judging by its extension. */
export function droppedKind(path: string): DroppedKind {
  const ext = /\.([A-Za-z0-9]+)$/.exec(path)?.[1].toLowerCase() ?? "";
  if (["md", "markdown", "mdown", "mkd", "txt"].includes(ext)) return "markdown";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(ext)) return "image";
  return "other";
}

/**
 * Files or folders dropped onto the desktop window: Markdown files open in
 * tabs, images are inserted at the drop position, a folder becomes the
 * workspace. `at` is the drop position in CSS pixels.
 */
export async function handleDroppedPaths(paths: string[], at?: { x: number; y: number }): Promise<void> {
  const images = paths.filter((p) => droppedKind(p) === "image");
  const docs = paths.filter((p) => droppedKind(p) === "markdown");
  const others = paths.filter((p) => droppedKind(p) === "other");

  for (const p of docs) await openDocument(p);

  // Only when nothing was opened, so the images do not land in a document that just came in.
  if (images.length > 0 && docs.length === 0) {
    const view: EditorView | null = editorRef.view;
    if (view) {
      const pos = at ? view.posAtCoords(at) : null;
      if (pos != null) view.dispatch({ selection: { anchor: pos } });
      await insertImagePaths(view, images);
    }
  }

  // The first thing that can be listed as a folder becomes the workspace.
  for (const p of others) {
    try {
      await platform.readDir(p);
    } catch {
      continue;
    }
    await openWorkspace(p);
    break;
  }
}
