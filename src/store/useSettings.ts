import { create } from "zustand";

export type Theme = "system" | "light" | "dark";
/** How Enter behaves inside lists and quotes. */
export type ListContinuation = "shift" | "enter" | "off";
/** What to do when a URL is pasted over selected text. */
export type SmartPaste = "always" | "ask" | "off";

export interface Settings {
  theme: Theme;
  editorFontSize: number;
  editorFontFamily: string;
  previewFontSize: number;
  tabSize: number;
  lineWrap: boolean;
  listContinuation: ListContinuation;
  /** Hide Markdown markup on lines the cursor is not on. */
  livePreview: boolean;
  smartPaste: SmartPaste;
  /** Seconds between autosaves of dirty documents that have a path; 0 disables. */
  autosaveSeconds: number;
  reopenLastFiles: boolean;
  checkUpdatesOnStartup: boolean;
  recentFiles: string[];
  lastOpenFiles: string[];
  lastWorkspace: string | null;
  /** Folders expanded in the workspace tree; kept so the tree looks the same after hiding the sidebar or restarting. */
  expandedDirs: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  editorFontSize: 14,
  editorFontFamily: "",
  previewFontSize: 15,
  tabSize: 2,
  lineWrap: true,
  listContinuation: "shift",
  livePreview: false,
  smartPaste: "ask",
  autosaveSeconds: 0,
  reopenLastFiles: true,
  checkUpdatesOnStartup: true,
  recentFiles: [],
  lastOpenFiles: [],
  lastWorkspace: null,
  expandedDirs: [],
};

const MAX_RECENT = 12;
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface Backend {
  load(): Promise<Partial<Settings>>;
  save(s: Settings): Promise<void>;
}

const localBackend: Backend = {
  async load() {
    try {
      return JSON.parse(localStorage.getItem("settings") ?? "{}");
    } catch {
      return {};
    }
  },
  async save(s) {
    try {
      localStorage.setItem("settings", JSON.stringify(s));
    } catch {
      /* ignore */
    }
  },
};

async function tauriBackend(): Promise<Backend> {
  const { load } = await import("@tauri-apps/plugin-store");
  const store = await load("settings.json", { autoSave: 300, defaults: {} });
  return {
    async load() {
      return (await store.get<Settings>("settings")) ?? {};
    },
    async save(s) {
      await store.set("settings", s);
    },
  };
}

let backend: Backend | null = null;

interface SettingsState extends Settings {
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
  addRecent: (path: string) => void;
  setDirExpanded: (path: string, expanded: boolean) => void;
  clearRecent: () => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,
  update: (patch) => {
    set(patch);
    void persist(get());
  },
  addRecent: (path) => {
    const recent = [path, ...get().recentFiles.filter((p) => p !== path)].slice(0, MAX_RECENT);
    set({ recentFiles: recent });
    void persist(get());
  },
  setDirExpanded: (path, expanded) => {
    const cur = get().expandedDirs;
    if (cur.includes(path) === expanded) return;
    set({ expandedDirs: expanded ? [...cur, path] : cur.filter((p) => p !== path) });
    void persist(get());
  },
  clearRecent: () => {
    set({ recentFiles: [] });
    void persist(get());
  },
}));

function pick(s: SettingsState): Settings {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = s[k as keyof Settings];
  return out as unknown as Settings;
}

async function persist(s: SettingsState) {
  if (!backend) return;
  await backend.save(pick(s));
}

/** Load the saved settings into the store and return them as they were on disk. */
export async function loadSettings(): Promise<Settings> {
  backend = inTauri ? await tauriBackend() : localBackend;
  const saved: Settings = { ...DEFAULT_SETTINGS, ...(await backend.load()) };
  useSettings.setState({ ...saved, loaded: true });
  return saved;
}

/** Apply the theme preference to the document root; "system" follows the OS. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function isDarkTheme(): boolean {
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
