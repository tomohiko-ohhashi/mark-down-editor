import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open, save, ask, message } from "@tauri-apps/plugin-dialog";
import type { Platform } from "./types";
import { t } from "../i18n";

/** File-type filters for the native dialogs (built per call so the names follow the UI language). */
export const mdFilters = () => [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
  { name: t("テキスト"), extensions: ["txt"] },
  { name: t("すべてのファイル"), extensions: ["*"] },
];

export const tauriPlatform: Platform = {
  kind: "tauri",
  pollIntervalMs: 2000,

  readFile: (path) => invoke("read_file", { path }),
  writeFile: (path, content, encoding) => invoke("write_file", { path, content, encoding: encoding ?? null }),
  fileMtime: (path) => invoke("file_mtime", { path }),
  readDir: (path) => invoke("read_dir", { path }),
  searchWorkspace: (root, query) => invoke("search_workspace", { root, query }),
  createDir: (path) => invoke("create_dir", { path }),
  rename: (from, to) => invoke("rename_path", { from, to }),
  deletePath: (path) => invoke("delete_path", { path }),
  deleteIsTrash: true,
  saveImage: (docPath, bytes, ext) =>
    // Raw body avoids JSON-encoding every byte; metadata travels in headers.
    invoke("save_image", bytes, { headers: { "doc-path": encodeURIComponent(docPath), ext } }),

  importImage: (docPath, source) => invoke("import_image", { docPath, source }),

  pickOpenPath: () => open({ multiple: false, directory: false, filters: mdFilters() }),
  pickSavePath: (defaultPath, filters = mdFilters()) => save({ defaultPath, filters }),
  pickDirectory: () => open({ directory: true, multiple: false }),

  ask: (msg, opts) => ask(msg, opts),
  message: async (msg, opts) => {
    await message(msg, opts);
  },

  listFonts: () => invoke("list_fonts"),

  assetUrl: (path) => convertFileSrc(path),
  openExternal: async (url) => {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  },

  takeStartupFiles: () => invoke<string[]>("take_startup_files").catch(() => []),
  rootName: async () => null,
};
