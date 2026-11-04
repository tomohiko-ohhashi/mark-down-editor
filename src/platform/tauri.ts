import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open, save, ask, message } from "@tauri-apps/plugin-dialog";
import type { Platform } from "./types";

export const MD_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
  { name: "テキスト", extensions: ["txt"] },
  { name: "すべてのファイル", extensions: ["*"] },
];

export const tauriPlatform: Platform = {
  kind: "tauri",
  pollIntervalMs: 2000,

  readFile: (path) => invoke("read_file", { path }),
  writeFile: (path, content) => invoke("write_file", { path, content }),
  fileMtime: (path) => invoke("file_mtime", { path }),
  readDir: (path) => invoke("read_dir", { path }),
  searchWorkspace: (root, query) => invoke("search_workspace", { root, query }),
  saveImage: (docPath, bytes, ext) =>
    // Raw body avoids JSON-encoding every byte; metadata travels in headers.
    invoke("save_image", bytes, { headers: { "doc-path": encodeURIComponent(docPath), ext } }),

  pickOpenPath: () => open({ multiple: false, directory: false, filters: MD_FILTERS }),
  pickSavePath: (defaultPath, filters = MD_FILTERS) => save({ defaultPath, filters }),
  pickDirectory: () => open({ directory: true, multiple: false }),

  ask: (msg, opts) => ask(msg, opts),
  message: async (msg, opts) => {
    await message(msg, opts);
  },

  assetUrl: (path) => convertFileSrc(path),
  openExternal: async (url) => {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  },

  takeStartupFiles: () => invoke<string[]>("take_startup_files").catch(() => []),
  rootName: async () => null,
};
