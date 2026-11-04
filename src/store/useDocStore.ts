import { create } from "zustand";

export type ViewMode = "editor" | "split" | "preview";

export interface Doc {
  id: string;
  /** Absolute path of the file on disk, or null for an unsaved document. */
  path: string | null;
  content: string;
  /** Content as it was at the last load/save; used to compute dirty state. */
  savedContent: string;
  /** Modification time (ms) at last load/save; used to detect external changes. */
  mtime: number | null;
}

interface DocState {
  docs: Doc[];
  activeId: string;
  viewMode: ViewMode;
  status: string | null;
  showSidebar: boolean;
  showOutline: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  settingsOpen: boolean;
  cheatSheetOpen: boolean;
  workspace: string | null;

  addDoc: (doc?: Partial<Omit<Doc, "id">>) => string;
  removeDoc: (id: string) => void;
  setActive: (id: string) => void;
  setContent: (id: string, content: string) => void;
  loadInto: (id: string, path: string | null, content: string, mtime: number | null) => void;
  /** Record a successful write. `written` is the exact text that went to disk. */
  markSaved: (id: string, path: string, mtime: number, written: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setStatus: (status: string | null) => void;
  toggle: (key: "showSidebar" | "showOutline" | "focusMode" | "typewriterMode" | "settingsOpen" | "cheatSheetOpen") => void;
  set: (partial: Partial<DocState>) => void;
}

let seq = 0;
export const newId = () => `doc-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function makeDoc(partial: Partial<Omit<Doc, "id">> = {}): Doc {
  const content = partial.content ?? "";
  return {
    id: newId(),
    path: partial.path ?? null,
    content,
    savedContent: partial.savedContent ?? content,
    mtime: partial.mtime ?? null,
  };
}

const first = makeDoc();

export const useDocStore = create<DocState>((set, get) => ({
  docs: [first],
  activeId: first.id,
  viewMode: "split",
  status: null,
  showSidebar: false,
  showOutline: false,
  focusMode: false,
  typewriterMode: false,
  settingsOpen: false,
  cheatSheetOpen: false,
  workspace: null,

  addDoc: (partial) => {
    const doc = makeDoc(partial);
    set((s) => ({ docs: [...s.docs, doc], activeId: doc.id }));
    return doc.id;
  },
  removeDoc: (id) => {
    const { docs, activeId } = get();
    const idx = docs.findIndex((d) => d.id === id);
    if (idx < 0) return;
    let next = docs.filter((d) => d.id !== id);
    let nextActive = activeId;
    if (next.length === 0) {
      const fresh = makeDoc();
      next = [fresh];
      nextActive = fresh.id;
    } else if (activeId === id) {
      nextActive = next[Math.min(idx, next.length - 1)].id;
    }
    set({ docs: next, activeId: nextActive });
  },
  setActive: (id) => set({ activeId: id }),
  setContent: (id, content) =>
    set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, content } : d)) })),
  loadInto: (id, path, content, mtime) =>
    set((s) => ({
      docs: s.docs.map((d) => (d.id === id ? { ...d, path, content, savedContent: content, mtime } : d)),
      status: null,
    })),
  markSaved: (id, path, mtime, written) =>
    set((s) => ({
      docs: s.docs.map((d) => (d.id === id ? { ...d, path, mtime, savedContent: written } : d)),
    })),
  setViewMode: (viewMode) => set({ viewMode }),
  setStatus: (status) => set({ status }),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<DocState>),
  set: (partial) => set(partial),
}));

export const isDirty = (d: Doc) => d.content !== d.savedContent;
export const selectActiveDoc = (s: DocState): Doc =>
  s.docs.find((d) => d.id === s.activeId) ?? s.docs[0];
export const selectActiveIsDirty = (s: DocState) => isDirty(selectActiveDoc(s));

export function fileName(path: string | null): string {
  if (!path) return "無題";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i > 0 ? path.slice(0, i) : path;
}

/** Flash a status message in the toolbar for a short time. */
export function flashStatus(message: string, ms = 2000) {
  useDocStore.getState().setStatus(message);
  setTimeout(() => {
    if (useDocStore.getState().status === message) useDocStore.getState().setStatus(null);
  }, ms);
}
