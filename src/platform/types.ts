/**
 * Everything the UI needs from its host. The desktop app implements it with
 * Tauri IPC and native dialogs; the web build talks to markdown-editor-server
 * over HTTP and uses in-app pickers. Paths are opaque strings to the UI:
 * absolute on the desktop, root-relative in the browser.
 */
export interface FileContent {
  content: string;
  mtime: number;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface AskOptions {
  title?: string;
  kind?: "info" | "warning" | "error";
  okLabel?: string;
  cancelLabel?: string;
}

export interface Platform {
  readonly kind: "tauri" | "web";

  readFile(path: string): Promise<FileContent>;
  writeFile(path: string, content: string): Promise<number>;
  fileMtime(path: string): Promise<number>;
  readDir(path: string): Promise<DirEntry[]>;
  /** Save image bytes next to `docPath`; returns the Markdown-relative path. */
  saveImage(docPath: string, bytes: Uint8Array, ext: string): Promise<string>;

  /** Let the user choose an existing file; null when cancelled. */
  pickOpenPath(): Promise<string | null>;
  /** Let the user choose where to save; null when cancelled. */
  pickSavePath(defaultPath: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null>;
  /** Let the user choose a folder to use as workspace; null when cancelled. */
  pickDirectory(): Promise<string | null>;

  ask(message: string, opts?: AskOptions): Promise<boolean>;
  message(message: string, opts?: AskOptions): Promise<void>;

  /** URL the webview can load for a file on disk (images in the preview). */
  assetUrl(path: string): string;
  openExternal(url: string): Promise<void>;

  /** Files the host wants opened at startup (CLI args, OS file association, URL). */
  takeStartupFiles(): Promise<string[]>;
  /** Human-readable name for the default workspace root (web mode). */
  rootName(): Promise<string | null>;
  /** How often to poll for external file changes, in ms. */
  readonly pollIntervalMs: number;
}
