import { create } from "zustand";
import { t } from "../i18n";

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
  /** Line ending of the file on disk. In memory the text always uses "\n" (as the editor does). */
  eol: Eol;
}

export type Eol = "\n" | "\r\n";

/** Split text loaded from disk into LF-only text and the line ending to write back. */
export function splitEol(text: string): { text: string; eol: Eol } {
  const eol: Eol = text.includes("\r\n") ? "\r\n" : "\n";
  return { text: text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text, eol };
}

/** The text of a document as it should be written to disk. */
export function diskText(doc: Pick<Doc, "content" | "eol">): string {
  return doc.eol === "\r\n" ? doc.content.replace(/\n/g, "\r\n") : doc.content;
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
  aboutOpen: boolean;
  cheatSheetOpen: boolean;
  workspace: string | null;
  /** Bumped whenever files are created / renamed / deleted so tree views reload. */
  treeVersion: number;
  /** Where the editor cursor is in the active document (for the status bar). */
  cursor: { line: number; col: number; selected: number };
  /** A source line the preview should scroll to once it has rendered the active document. */
  reveal: { line: number; seq: number } | null;

  addDoc: (doc?: Partial<Omit<Doc, "id" | "eol">>) => string;
  removeDoc: (id: string) => void;
  setActive: (id: string) => void;
  setContent: (id: string, content: string) => void;
  loadInto: (id: string, path: string | null, content: string, mtime: number | null) => void;
  /** Record a successful write. `written` is the in-memory (LF) text that was saved. */
  markSaved: (id: string, path: string, mtime: number, written: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setStatus: (status: string | null) => void;
  toggle: (key: "showSidebar" | "showOutline" | "focusMode" | "typewriterMode" | "settingsOpen" | "aboutOpen" | "cheatSheetOpen") => void;
  set: (partial: Partial<DocState>) => void;
}

let seq = 0;
export const newId = () => `doc-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function makeDoc(partial: Partial<Omit<Doc, "id" | "eol">> = {}): Doc {
  const { text: content, eol } = splitEol(partial.content ?? "");
  return {
    id: newId(),
    path: partial.path ?? null,
    content,
    savedContent: partial.savedContent != null ? splitEol(partial.savedContent).text : content,
    mtime: partial.mtime ?? null,
    eol,
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
  aboutOpen: false,
  cheatSheetOpen: false,
  workspace: null,
  treeVersion: 0,
  cursor: { line: 1, col: 1, selected: 0 },
  reveal: null,

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
  loadInto: (id, path, raw, mtime) => {
    const { text: content, eol } = splitEol(raw);
    set((s) => ({
      docs: s.docs.map((d) => (d.id === id ? { ...d, path, content, savedContent: content, mtime, eol } : d)),
      status: null,
    }));
  },
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
  if (!path) return t("無題");
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** Directory part of a path: "" for a bare file name, "/" for a root-level POSIX file. */
export function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (i < 0) return "";
  if (i === 0) return path[0];
  return path.slice(0, i);
}

/** Flash a status message in the toolbar for a short time. */
export function flashStatus(message: string, ms = 2000) {
  useDocStore.getState().setStatus(message);
  setTimeout(() => {
    if (useDocStore.getState().status === message) useDocStore.getState().setStatus(null);
  }, ms);
}
