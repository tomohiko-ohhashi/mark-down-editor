import { platform } from "../platform";
import { useDocStore, selectActiveDoc, type ViewMode } from "../store/useDocStore";
import { useSettings, type SessionState, type Settings } from "../store/useSettings";
import { openDocument } from "./files/fileOps";

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
  const next = snapshotSession(useDocStore.getState(), cursors);
  const cur = useSettings.getState();
  if (
    JSON.stringify(next.session) === JSON.stringify(cur.session) &&
    next.lastOpenFiles.join("\n") === cur.lastOpenFiles.join("\n")
  ) {
    return;
  }
  cur.update(next);
}

function startTracking() {
  if (tracking) return;
  tracking = true;
  useDocStore.subscribe(scheduleSave);
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
    if (session?.activeFile) {
      const state = useDocStore.getState();
      const front = state.docs.find((d) => d.path === session.activeFile);
      if (front && front.id !== selectActiveDoc(state).id) state.setActive(front.id);
    }
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
