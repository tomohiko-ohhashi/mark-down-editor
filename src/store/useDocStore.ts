import { create } from "zustand";

export type ViewMode = "editor" | "split" | "preview";

interface DocState {
  /** Absolute path of the file on disk, or null for an unsaved document. */
  path: string | null;
  content: string;
  /** Content as it was at the last load/save; used to compute dirty state. */
  savedContent: string;
  /** Modification time (ms) at last load/save; used to detect external changes. */
  mtime: number | null;
  viewMode: ViewMode;
  status: string | null;

  setContent: (content: string) => void;
  loadDocument: (path: string | null, content: string, mtime: number | null) => void;
  markSaved: (path: string, mtime: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setStatus: (status: string | null) => void;
}

export const useDocStore = create<DocState>((set) => ({
  path: null,
  content: "",
  savedContent: "",
  mtime: null,
  viewMode: "split",
  status: null,

  setContent: (content) => set({ content }),
  loadDocument: (path, content, mtime) =>
    set({ path, content, savedContent: content, mtime, status: null }),
  markSaved: (path, mtime) =>
    set((s) => ({ path, mtime, savedContent: s.content })),
  setViewMode: (viewMode) => set({ viewMode }),
  setStatus: (status) => set({ status }),
}));

export const selectIsDirty = (s: DocState) => s.content !== s.savedContent;

export function fileName(path: string | null): string {
  if (!path) return "無題";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
