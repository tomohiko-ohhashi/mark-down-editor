import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Toolbar } from "./components/Toolbar";
import { StatusBar } from "./components/StatusBar";
import { Editor } from "./editor/Editor";
import { Preview } from "./preview/Preview";
import { useDocStore, selectIsDirty, fileName } from "./store/useDocStore";
import {
  newDocument,
  openDocument,
  saveDocument,
  saveDocumentAs,
  confirmDiscardChanges,
  checkExternalChange,
} from "./features/files/fileOps";

const inTauri = "__TAURI_INTERNALS__" in window;

export default function App() {
  const viewMode = useDocStore((s) => s.viewMode);
  const setViewMode = useDocStore((s) => s.setViewMode);
  const path = useDocStore((s) => s.path);
  const dirty = useDocStore(selectIsDirty);

  // Window title reflects the document and its dirty state.
  useEffect(() => {
    const title = `${dirty ? "● " : ""}${fileName(path)} - Markdown Editor`;
    document.title = title;
    if (inTauri) getCurrentWindow().setTitle(title).catch(() => {});
  }, [path, dirty]);

  // Global shortcuts for file operations and view modes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "s" && e.shiftKey) { e.preventDefault(); void saveDocumentAs(); }
      else if (k === "s") { e.preventDefault(); void saveDocument(); }
      else if (k === "o") { e.preventDefault(); void openDocument(); }
      else if (k === "n") { e.preventDefault(); void newDocument(); }
      else if (e.shiftKey && (e.code === "Digit1" || k === "!")) { e.preventDefault(); setViewMode("editor"); }
      else if (e.shiftKey && (e.code === "Digit2" || k === "@" || k === '"')) { e.preventDefault(); setViewMode("split"); }
      else if (e.shiftKey && (e.code === "Digit3" || k === "#")) { e.preventDefault(); setViewMode("preview"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setViewMode]);

  // Ask before closing the window with unsaved changes.
  useEffect(() => {
    if (!inTauri) return;
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async (event) => {
      if (!selectIsDirty(useDocStore.getState())) return;
      event.preventDefault();
      if (await confirmDiscardChanges()) {
        await win.destroy();
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Open a file passed on the command line or via OS file association.
  useEffect(() => {
    if (!inTauri) return;
    invoke<string[]>("take_startup_files")
      .then((files) => {
        if (files.length > 0) void openDocument(files[0]);
      })
      .catch(() => {});
    const unlisten = listen<string[]>("open-files", (e) => {
      if (e.payload.length > 0) void openDocument(e.payload[0]);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Detect changes made to the open file by other programs.
  useEffect(() => {
    if (!inTauri) return;
    const id = setInterval(() => void checkExternalChange(), 2000);
    const onFocus = () => void checkExternalChange();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <main className={`panes mode-${viewMode}`}>
        <section className="pane pane-editor">
          <Editor />
        </section>
        <section className="pane pane-preview">
          <Preview />
        </section>
      </main>
      <StatusBar />
    </div>
  );
}
