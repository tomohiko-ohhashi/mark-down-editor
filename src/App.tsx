import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { platform, inTauri } from "./platform";
import { FilePicker } from "./components/FilePicker";
import { PromptDialog } from "./components/PromptDialog";
import { searchBoxRef } from "./components/Sidebar";
import { Toolbar, MobileBar } from "./components/Toolbar";
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
      const startup = await platform.takeStartupFiles();
      if (startup.length > 0) {
        for (const f of startup) await openDocument(f);
      } else if (s.reopenLastFiles) {
        for (const f of s.lastOpenFiles) await openDocument(f);
      }
      if (platform.kind === "web") {
        // The server exposes one folder; show it right away on wide screens.
        useDocStore.getState().set({ workspace: "", showSidebar: window.innerWidth >= 768 });
        if (window.innerWidth < 768 && useDocStore.getState().viewMode === "split") {
          useDocStore.getState().setViewMode("editor");
        }
      } else if (s.lastWorkspace) {
        useDocStore.getState().set({ workspace: s.lastWorkspace });
      }
      if (inTauri && s.checkUpdatesOnStartup) setTimeout(() => void checkForUpdates(true), 3000);
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
        if (code === "KeyD") return run(() => toggle("focusMode"));
        if (code === "KeyF")
          return run(() => {
            if (!state.showSidebar) toggle("showSidebar");
            setTimeout(() => searchBoxRef.el?.focus(), 50);
          });
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
      if (code === "KeyP") return run(() => void exportPdf());
      if (code === "Comma") return run(() => toggle("settingsOpen"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setViewMode, toggle]);

  // Browser: warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (inTauri) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useDocStore.getState().docs.some((d) => d.content !== d.savedContent)) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

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

  // Files opened via the OS while running (macOS). Registered before the startup
  // drain below runs so an early Opened event is not missed.
  useEffect(() => {
    if (!inTauri) return;
    const unlisten = listen<string[]>("open-files", async (e) => {
      for (const f of e.payload) await openDocument(f);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Quit from the macOS menu (Cmd+Q) goes through the same unsaved-changes check.
  useEffect(() => {
    if (!inTauri) return;
    const unlisten = listen("quit-requested", async () => {
      if (await confirmDiscardAll()) {
        const { exit } = await import("@tauri-apps/plugin-process");
        await exit(0);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Detect changes made to open files by other programs.
  useEffect(() => {
    const id = setInterval(() => void checkExternalChanges(), platform.pollIntervalMs);
    const onFocus = () => void checkExternalChanges();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Autosave.
  useEffect(() => {
    if (autosaveSeconds <= 0) return;
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
      <MobileBar />
      <SettingsDialog />
      <CheatSheet />
      <FilePicker />
      <PromptDialog />
    </div>
  );
}
