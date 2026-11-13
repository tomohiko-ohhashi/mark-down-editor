import { platform } from "../platform";
import { useDocStore, selectActiveDoc, fileName, flashStatus } from "../store/useDocStore";
import { renderMarkdown } from "../preview/markdown";
import { writeFile } from "./files/fileOps";
import { beginPrint, endPrint } from "./printPage";
import previewCss from "../preview/preview.css?raw";

import katex from "katex";
import katexCss from "katex/dist/katex.min.css?raw";
import { previewReady } from "../preview/Preview";
import { getLanguage, t, tError } from "../i18n";

// The style sheet of the KaTeX version that rendered the markup, put into the exported file itself
// so that formulas are laid out without a network (linked from a CDN, each formula showed twice
// when offline). Only the fonts are fetched; without them the browser's own fonts are used.
const KATEX_CSS = katexCss.replace(/url\(fonts\//g, `url(https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/fonts/`);

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Build a standalone HTML document for the current tab. Images keep their relative paths. */
export async function buildStandaloneHtml(): Promise<string> {
  const doc = selectActiveDoc(useDocStore.getState());
  const body = await renderMarkdown(doc.content, { docDir: null, mermaid: true, dark: false });
  const title = fileName(doc.path).replace(/\.\w+$/, "");
  const needsKatex = body.includes("class=\"katex");
  return `<!doctype html>
<html lang="${getLanguage()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${needsKatex ? KATEX_CSS : ""}
:root { --bg: #ffffff; --bg-alt: #f6f7f9; --fg: #1f2328; --fg-muted: #6e7781; --border: #d8dee4; --link: #0969da; --code: #cf222e;
  --syntax-keyword: #cf222e; --syntax-string: #0a3069; --syntax-number: #0550ae; --syntax-function: #8250df;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", Meiryo, sans-serif; }
.markdown-body { max-width: 860px; margin: 0 auto; padding: 32px 24px; font-size: 16px; }
${previewCss}
</style>
</head>
<body>
<article class="markdown-body">
${body}
</article>
</body>
</html>
`;
}

export async function exportHtml(): Promise<void> {
  const doc = selectActiveDoc(useDocStore.getState());
  const defaultPath = (doc.path ?? "untitled.md").replace(/\.\w+$/, "") + ".html";
  const path = await platform.pickSavePath(defaultPath, [{ name: "HTML", extensions: ["html"] }]);
  if (!path) return;
  try {
    await writeFile(path, await buildStandaloneHtml());
    flashStatus(t("HTML を書き出しました"));
  } catch (e) {
    await platform.message(tError(e), { title: t("書き出せませんでした"), kind: "error" });
  }
}

const printName = () => fileName(selectActiveDoc(useDocStore.getState()).path);

/**
 * Printing started from the browser's own menu (web mode) gets the same page
 * header / footer as the PDF export. Returns a function that removes the hooks.
 */
export function installPrintHooks(): () => void {
  const before = () => beginPrint(printName());
  window.addEventListener("beforeprint", before);
  window.addEventListener("afterprint", endPrint);
  return () => {
    window.removeEventListener("beforeprint", before);
    window.removeEventListener("afterprint", endPrint);
  };
}

/**
 * PDF export uses the OS print dialog (choose "Save as PDF" there). The print
 * stylesheet shows only the preview pane, and the page header / footer carry
 * just the file name, the time and the page number (see printPage.ts). On macOS, where WKWebView has no
 * native window.print, Tauri replaces window.print with its webview print
 * command; that needs the `core:webview:allow-print` permission (granted in
 * src-tauri/capabilities/default.json).
 */
export async function exportPdf(): Promise<void> {
  const state = useDocStore.getState();
  const prevMode = state.viewMode;
  if (prevMode === "editor") state.setViewMode("preview");
  // The preview may be behind (it is not kept up to date key by key while hidden): have it render first.
  await previewReady();
  await new Promise((r) => setTimeout(r, 50));
  beginPrint(printName());
  const started = Date.now();
  try {
    await Promise.resolve(window.print());
  } finally {
    // Where print() blocks until the dialog is closed, we are done. Where it returns at
    // once, the page is still being laid out: leave the clean-up to `afterprint`,
    // with a late backstop for webviews that never fire it.
    if (Date.now() - started > 1000) endPrint();
    else setTimeout(endPrint, 60_000);
    if (prevMode === "editor") useDocStore.getState().setViewMode(prevMode);
  }
}
