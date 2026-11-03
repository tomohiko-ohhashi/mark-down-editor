import { save, message } from "@tauri-apps/plugin-dialog";
import { useDocStore, selectActiveDoc, fileName, flashStatus } from "../store/useDocStore";
import { renderMarkdown } from "../preview/markdown";
import { writeFile } from "./files/fileOps";
import previewCss from "../preview/preview.css?raw";

const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css";

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
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${needsKatex ? `<link rel="stylesheet" href="${KATEX_CSS}">` : ""}
<style>
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
  const path = await save({ defaultPath, filters: [{ name: "HTML", extensions: ["html"] }] });
  if (!path) return;
  try {
    await writeFile(path, await buildStandaloneHtml());
    flashStatus("HTML を書き出しました");
  } catch (e) {
    await message(String(e), { title: "書き出せませんでした", kind: "error" });
  }
}

/**
 * PDF export uses the OS print dialog (choose "Save as PDF" there). The print
 * stylesheet shows only the preview pane.
 */
export function exportPdf(): void {
  const state = useDocStore.getState();
  const prevMode = state.viewMode;
  if (prevMode === "editor") state.setViewMode("preview");
  // Give the preview a frame to render before printing.
  setTimeout(() => {
    window.print();
    if (prevMode === "editor") useDocStore.getState().setViewMode(prevMode);
  }, 150);
}
