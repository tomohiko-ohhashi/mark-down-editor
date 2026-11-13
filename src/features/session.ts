import { platform } from "../platform";
import { useDocStore, selectActiveDoc, type ViewMode } from "../store/useDocStore";
import { useSettings, type SessionState, type Settings, type UnsavedDoc } from "../store/useSettings";
import { openDocument, confirmDiscardAll } from "./files/fileOps";
import { choose } from "../components/ConfirmDialog";
import { flushSettings } from "../store/useSettings";
import { t } from "../i18n";

/**
 * Session = what the window looked like when it was last closed: the open
 * tabs and which one was in front, the cursor line in each file, and which
 * panels / view mode were shown. It is stored with the settings and restored
 * on a start without files given on the command line.
 */

const VIEW_MODES: ViewMode[] = ["editor", "split", "preview"];

/** Cursor line (1-based) per file path, updated by the editor as the cursor moves. */
const cursors = new Map<string, number>();
/** Cursor lines from the previous session, handed to the editor when it first shows a file. */
const pendingCursors = new Map<string, number>();

/** Called by the editor whenever the cursor of a saved file moves. */
export function noteCursor(path: string | null, line: number): void {
  if (!path || cursors.get(path) === line) return;
  cursors.set(path, line);
  scheduleSave();
}

/** The line the cursor was on in the previous session, once per file. */
export function takeRestoredCursor(path: string | null): number | null {
  if (!path) return null;
  const line = pendingCursors.get(path);
  if (line == null) return null;
  pendingCursors.delete(path);
  return line;
}

/** Character offset of the start of a 1-based line (clamped to the text). */
export function lineOffset(text: string, line: number): number {
  let pos = 0;
  for (let n = 1; n < line; n++) {
    const next = text.indexOf("\n", pos);
    if (next < 0) break;
    pos = next + 1;
  }
  return pos;
}

/** Make a stored session safe to use: it may be missing, from an older version, or hand-edited. */
export function normalizeSession(raw: unknown): SessionState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const cursorMap: Record<string, number> = {};
  if (r.cursors && typeof r.cursors === "object") {
    for (const [path, line] of Object.entries(r.cursors as Record<string, unknown>)) {
      if (typeof line === "number" && Number.isFinite(line) && line >= 1) cursorMap[path] = Math.floor(line);
    }
  }
  return {
    activeFile: typeof r.activeFile === "string" ? r.activeFile : null,
    showSidebar: r.showSidebar === true,
    showOutline: r.showOutline === true,
    cheatSheetOpen: r.cheatSheetOpen === true,
    viewMode: VIEW_MODES.includes(r.viewMode as ViewMode) ? (r.viewMode as ViewMode) : "split",
    typewriterMode: r.typewriterMode === true,
    cursors: cursorMap,
  };
}

interface SnapshotSource {
  docs: { id: string; path: string | null }[];
  activeId: string;
  showSidebar: boolean;
  showOutline: boolean;
  cheatSheetOpen: boolean;
  viewMode: ViewMode;
  typewriterMode: boolean;
}

/** What to remember about the current window. Untitled documents have no path and are left out. */
export function snapshotSession(
  s: SnapshotSource,
  cursorLines: ReadonlyMap<string, number>,
): { lastOpenFiles: string[]; session: SessionState } {
  const lastOpenFiles = s.docs.map((d) => d.path).filter((p): p is string => !!p);
  const cursorMap: Record<string, number> = {};
  for (const path of lastOpenFiles) {
    const line = cursorLines.get(path);
    if (line != null && line > 1) cursorMap[path] = line;
  }
  return {
    lastOpenFiles,
    session: {
      activeFile: s.docs.find((d) => d.id === s.activeId)?.path ?? null,
      showSidebar: s.showSidebar,
      showOutline: s.showOutline,
      cheatSheetOpen: s.cheatSheetOpen,
      viewMode: s.viewMode,
      typewriterMode: s.typewriterMode,
      cursors: cursorMap,
    },
  };
}

/** The documents with unsaved changes, to be kept for the next start (nothing when the feature is off). */
export function unsavedSnapshot(
  docs: { path: string | null; content: string; savedContent: string }[],
  enabled: boolean,
): UnsavedDoc[] {
  if (!enabled) return [];
  return docs.filter((d) => d.content !== d.savedContent).map((d) => ({ path: d.path, content: d.content }));
}

/** Make stored unsaved documents safe to use. */
export function normalizeUnsaved(raw: unknown): UnsavedDoc[] {
  if (!Array.isArray(raw)) return [];
  const out: UnsavedDoc[] = [];
  for (const item of raw as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.content !== "string") continue;
    out.push({ path: typeof r.path === "string" && r.path ? r.path : null, content: r.content });
  }
  return out;
}

/** Bring back documents that had unsaved changes when the app was last closed. */
async function restoreUnsaved(list: UnsavedDoc[]): Promise<void> {
  for (const u of list) {
    let state = useDocStore.getState();
    if (u.path) {
      if (!state.docs.some((d) => d.path === u.path)) await openDocument(u.path, { silent: true });
      state = useDocStore.getState();
      const doc = state.docs.find((d) => d.path === u.path);
      if (doc) {
        state.setContent(doc.id, u.content);
        continue;
      }
      // The file is gone: keep the text as a new, unsaved document rather than lose it.
    }
    const active = selectActiveDoc(state);
    if (!active.path && active.content === "" && active.savedContent === "") state.setContent(active.id, u.content);
    else state.addDoc({ content: u.content, savedContent: "" });
  }
}

let tracking = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (!tracking) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(saveSessionNow, 500);
}

/** Write the current session to the settings store (no-op when nothing changed). */
export function saveSessionNow(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!tracking) return;
  const cur = useSettings.getState();
  const docState = useDocStore.getState();
  const next = { ...snapshotSession(docState, cursors), unsavedDocs: unsavedSnapshot(docState.docs, cur.restoreUnsaved) };
  if (
    JSON.stringify(next.session) === JSON.stringify(cur.session) &&
    next.lastOpenFiles.join("\n") === cur.lastOpenFiles.join("\n") &&
    JSON.stringify(next.unsavedDocs) === JSON.stringify(cur.unsavedDocs)
  ) {
    return;
  }
  cur.update(next);
}

function startTracking() {
  if (tracking) return;
  tracking = true;
  useDocStore.subscribe(scheduleSave);
  // Turning "restore unsaved changes" on or off changes what has to be kept.
  useSettings.subscribe((s, prev) => {
    if (s.restoreUnsaved !== prev.restoreUnsaved) scheduleSave();
  });
  // Closing a tab / the app: don't lose the last half second.
  window.addEventListener("pagehide", saveSessionNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveSessionNow();
  });
  scheduleSave();
}

/**
 * Bring back the previous session (or open the files given at start-up), then
 * start recording the session. Recording only begins afterwards, otherwise the
 * empty start-up state would overwrite what is about to be restored.
 */
export async function restoreSession(saved: Settings): Promise<void> {
  const startup = await platform.takeStartupFiles();
  const narrow = window.innerWidth < 768;
  // Files given explicitly win: open just those, with the plain layout.
  const restore = saved.reopenLastFiles && startup.length === 0;
  const session = restore ? normalizeSession(saved.session) : null;

  if (startup.length > 0) {
    for (const f of startup) await openDocument(f);
  } else if (restore) {
    if (session) {
      for (const [path, line] of Object.entries(session.cursors)) {
        pendingCursors.set(path, line);
        // Also the starting point for this run, so tabs that are never visited keep their line.
        cursors.set(path, line);
      }
    }
    for (const f of saved.lastOpenFiles) await openDocument(f, { silent: true });
  }
  // Unsaved changes come back however the app was started.
  if (saved.restoreUnsaved) await restoreUnsaved(normalizeUnsaved(saved.unsavedDocs));
  if (session?.activeFile) {
    const state = useDocStore.getState();
    const front = state.docs.find((d) => d.path === session.activeFile);
    if (front && front.id !== selectActiveDoc(state).id) state.setActive(front.id);
  }

  const store = useDocStore.getState();
  if (platform.kind === "web") {
    // The server exposes one folder. On phones the panels are overlays, so they start closed.
    store.set({ workspace: "", showSidebar: !narrow && (session ? session.showSidebar : true) });
  } else {
    store.set({ workspace: saved.lastWorkspace, showSidebar: !!session?.showSidebar });
  }
  if (session) {
    store.set({
      showOutline: !narrow && session.showOutline,
      cheatSheetOpen: !narrow && session.cheatSheetOpen,
      typewriterMode: session.typewriterMode,
    });
    store.setViewMode(narrow && session.viewMode === "split" ? "editor" : session.viewMode);
  } else if (narrow && store.viewMode === "split") {
    store.setViewMode("editor");
  }

  startTracking();
}

/**
 * The window is about to close with unsaved changes. Returns true when it may
 * close. With "restore unsaved changes" the text is kept for the next start
 * (after a short notice, unless that is switched off); otherwise every
 * document is offered for saving.
 */
export async function confirmQuit(): Promise<boolean> {
  saveSessionNow();
  if (!useDocStore.getState().docs.some((d) => d.content !== d.savedContent)) return true;
  const s = useSettings.getState();
  if (!s.restoreUnsaved) return confirmDiscardAll();
  if (!s.quitWithoutAsking) {
    const answer = await choose({
      title: t("未保存の変更"),
      message: t("保存されていない変更があります。次回の起動時に復元されます。終了しますか？"),
      choices: [
        { id: "cancel", label: t("キャンセル") },
        { id: "quit", label: t("終了する"), kind: "primary" },
      ],
    });
    if (answer !== "quit") return false;
  }
  saveSessionNow();
  await flushSettings();
  return true;
}
