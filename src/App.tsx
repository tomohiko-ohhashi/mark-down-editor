import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Toolbar } from "./components/Toolbar";
import { TabBar } from "./components/TabBar";
import { StatusBar } from "./components/StatusBar";
import { Sidebar } from "./components/Sidebar";
import { Outline } from "./components/Outline";
import { SettingsDialog } from "./components/SettingsDialog";
import { CheatSheet } from "./components/CheatSheet";
import { Editor } from "./editor/Editor";
import { Preview } from "./preview/Preview";
import { useDocStore, selectActiveDoc, selectActiveIsDirty, fileName } from "./store/useDocStore";
import { useSettings, applyTheme, loadSettings } from "./store/useSettings";
import {
  newDocument,
  openDocument,
  saveDocument,
  saveDocumentAs,
  closeDocument,
  confirmDiscardAll,
  checkExternalChanges,
  autosaveAll,
} from "./features/files/fileOps";
import { exportHtml, exportPdf } from "./features/export";
import { checkForUpdates } from "./features/updater";

const inTauri = "__TAURI_INTERNALS__" in window;

export default function App() {
  const viewMode = useDocStore((s) => s.viewMode);
  const setViewMode = useDocStore((s) => s.setViewMode);
  const toggle = useDocStore((s) => s.toggle);
  const doc = useDocStore(selectActiveDoc);
  const dirty = useDocStore(selectActiveIsDirty);
  const showSidebar = useDocStore((s) => s.showSidebar);
  const showOutline = useDocStore((s) => s.showOutline);
  const focusMode = useDocStore((s) => s.focusMode);
  const theme = useSettings((s) => s.theme);
  const autosaveSeconds = useSettings((s) => s.autosaveSeconds);
  const loaded = useSettings((s) => s.loaded);

  // Load settings, then restore the previous session and check for updates.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadSettings();
      if (cancelled) return;
      const s = useSettings.getState();
      if (inTauri) {
        const startup = await invoke<string[]>("take_startup_files").catch(() => [] as string[]);
        if (startup.length > 0) {
          for (const f of startup) await openDocument(f);
        } else if (s.reopenLastFiles) {
          for (const f of s.lastOpenFiles) await openDocument(f);
        }
        if (s.lastWorkspace) useDocStore.getState().set({ workspace: s.lastWorkspace });
        if (s.checkUpdatesOnStartup) setTimeout(() => void checkForUpdates(true), 3000);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => applyTheme(theme), [theme]);

  // Remember the open files for the next launch.
  const openPaths = useDocStore((s) => s.docs.map((d) => d.path).filter((p): p is string => !!p).join("\n"));
  useEffect(() => {
    if (!loaded) return;
    const list = openPaths ? openPaths.split("\n") : [];
    const cur = useSettings.getState().lastOpenFiles;
    if (list.join("\n") !== cur.join("\n")) useSettings.getState().update({ lastOpenFiles: list });
  }, [openPaths, loaded]);

  // Window title reflects the document and its dirty state.
  useEffect(() => {
    const title = `${dirty ? "● " : ""}${fileName(doc.path)} - Markdown Editor`;
    document.title = title;
    if (inTauri) getCurrentWindow().setTitle(title).catch(() => {});
  }, [doc.path, dirty]);

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const state = useDocStore.getState();
      if (e.key === "F1") {
        e.preventDefault();
        return toggle("cheatSheetOpen");
      }
      if (e.key === "Escape") {
        if (state.cheatSheetOpen) toggle("cheatSheetOpen");
        else if (state.settingsOpen) toggle("settingsOpen");
        else if (state.focusMode) toggle("focusMode");
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const code = e.code;
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (e.ctrlKey && code === "Tab") {
        const i = state.docs.findIndex((d) => d.id === state.activeId);
        const n = (i + (e.shiftKey ? -1 : 1) + state.docs.length) % state.docs.length;
        return run(() => state.setActive(state.docs[n].id));
      }
      if (e.shiftKey) {
        if (code === "KeyS") return run(() => void saveDocumentAs());
        if (code === "KeyH") return run(() => void exportHtml());
        if (code === "KeyE") return run(() => toggle("showSidebar"));
        if (code === "KeyO") return run(() => toggle("showOutline"));
        if (code === "KeyF") return run(() => toggle("focusMode"));
        if (code === "KeyT") return run(() => toggle("typewriterMode"));
        if (code === "Slash") return run(() => toggle("cheatSheetOpen"));
        if (code === "Digit1") return run(() => setViewMode("editor"));
        if (code === "Digit2") return run(() => setViewMode("split"));
        if (code === "Digit3") return run(() => setViewMode("preview"));
        return;
      }
      if (code === "KeyS") return run(() => void saveDocument());
      if (code === "KeyO") return run(() => void openDocument());
      if (code === "KeyN") return run(() => newDocument());
      if (code === "KeyW") return run(() => void closeDocument());
      if (code === "KeyP") return run(() => exportPdf());
      if (code === "Comma") return run(() => toggle("settingsOpen"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setViewMode, toggle]);

  // Ask before closing the window with unsaved changes.
  useEffect(() => {
    if (!inTauri) return;
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async (event) => {
      if (!useDocStore.getState().docs.some((d) => d.content !== d.savedContent)) return;
      event.preventDefault();
      if (await confirmDiscardAll()) await win.destroy();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Files opened via the OS while running (macOS).
  useEffect(() => {
    if (!inTauri) return;
    const unlisten = listen<string[]>("open-files", (e) => {
      for (const f of e.payload) void openDocument(f);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Detect changes made to open files by other programs.
  useEffect(() => {
    if (!inTauri) return;
    const id = setInterval(() => void checkExternalChanges(), 2000);
    const onFocus = () => void checkExternalChanges();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Autosave.
  useEffect(() => {
    if (!inTauri || autosaveSeconds <= 0) return;
    const id = setInterval(() => void autosaveAll(), autosaveSeconds * 1000);
    return () => clearInterval(id);
  }, [autosaveSeconds]);

  const effectiveMode = focusMode ? "editor" : viewMode;

  return (
    <div className={`app ${focusMode ? "focus" : ""}`}>
      <Toolbar />
      <TabBar />
      <div className="workbench">
        {showSidebar && !focusMode && <Sidebar />}
        <main className={`panes mode-${effectiveMode}`}>
          <section className="pane pane-editor">
            <Editor />
          </section>
          <section className="pane pane-preview">
            <Preview />
          </section>
        </main>
        {showOutline && !focusMode && <Outline />}
      </div>
      <StatusBar />
      <SettingsDialog />
      <CheatSheet />
    </div>
  );
}
