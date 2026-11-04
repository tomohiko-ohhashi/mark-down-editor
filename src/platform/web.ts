import type { Platform, FileContent, DirEntry } from "./types";
import { openPicker } from "../components/FilePicker";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401) msg = "認証が切れました。ページを再読み込みしてトークンを入力してください。";
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

const q = (params: Record<string, string>) =>
  "?" + new URLSearchParams(params).toString();

let configPromise: Promise<{ rootName: string }> | null = null;
const config = () => (configPromise ??= api<{ rootName: string }>("/config"));

export const webPlatform: Platform = {
  kind: "web",
  pollIntervalMs: 5000,

  readFile: (path) => api<FileContent>(`/file${q({ path })}`),
  writeFile: async (path, content) =>
    (await api<{ mtime: number }>(`/file${q({ path })}`, {
      method: "PUT",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: content,
    })).mtime,
  fileMtime: async (path) => (await api<{ mtime: number }>(`/mtime${q({ path })}`)).mtime,
  readDir: (path) => api<DirEntry[]>(`/dir${q({ path })}`),
  saveImage: async (docPath, bytes, ext) =>
    (await api<{ path: string }>(`/image${q({ doc: docPath, ext })}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Blob([bytes as BlobPart]),
    })).path,

  pickOpenPath: () => openPicker({ mode: "open" }),
  pickSavePath: (defaultPath, filters) =>
    openPicker({ mode: "save", defaultPath, extensions: filters?.[0]?.extensions ?? ["md"] }),
  // The server exposes exactly one folder, so the workspace is always its root.
  pickDirectory: async () => "",

  ask: async (msg) => window.confirm(msg),
  message: async (msg) => window.alert(msg),

  assetUrl: (path) => `/api/raw${q({ path })}`,
  openExternal: async (url) => {
    window.open(url, "_blank", "noopener");
  },

  takeStartupFiles: async () => {
    const file = new URLSearchParams(window.location.search).get("file");
    return file ? [file] : [];
  },
  rootName: async () => (await config()).rootName,
};
