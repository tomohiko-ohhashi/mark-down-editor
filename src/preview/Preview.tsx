import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "./markdown";
import { useDocStore, selectActiveDoc, dirName } from "../store/useDocStore";
import { useSettings, isDarkTheme } from "../store/useSettings";
import { useScrollSync } from "./useScrollSync";
import { openDocument } from "../features/files/fileOps";
import { joinPath, isAbsolutePath } from "./paths";
import { platform } from "../platform";

/**
 * Links in the rendered HTML must not navigate the webview itself:
 * external URLs open in the system browser, #anchors scroll the preview,
 * and relative Markdown links open the target file in a tab.
 */
async function onPreviewClick(e: React.MouseEvent<HTMLDivElement>, docPath: string | null) {
  const a = (e.target as HTMLElement).closest("a");
  if (!a) return;
  const href = a.getAttribute("href") ?? "";
  e.preventDefault();
  if (href.startsWith("#")) {
    const id = decodeURIComponent(href.slice(1));
    const target = e.currentTarget.querySelector(`[id="${CSS.escape(id)}"]`);
    target?.scrollIntoView({ block: "start" });
    return;
  }
  if (/^(https?:|mailto:)/i.test(href)) {
    await platform.openExternal(href).catch(() => {});
    return;
  }
  if (/\.(md|markdown|mdown|mkd|txt)(#.*)?$/i.test(href)) {
    const rel = href.replace(/#.*$/, "");
    let decoded = rel;
    try {
      decoded = decodeURIComponent(rel);
    } catch {
      /* use raw */
    }
    const abs = isAbsolutePath(decoded) ? decoded : docPath != null ? joinPath(dirName(docPath), decoded) : null;
    if (abs) void openDocument(abs);
  }
}

export function Preview() {
  const doc = useDocStore(selectActiveDoc);
  const theme = useSettings((s) => s.theme);
  const previewFontSize = useSettings((s) => s.previewFontSize);
  const [html, setHtml] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useScrollSync("preview", ref);
  const [systemDark, setSystemDark] = useState(() => isDarkTheme());

  // Re-render Mermaid diagrams when the OS theme flips while following "system".
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(isDarkTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      renderMarkdown(doc.content, {
        docDir: doc.path != null ? dirName(doc.path) : null,
        mermaid: true,
        dark: isDarkTheme(),
      }).then((h) => {
        if (!cancelled) setHtml(h);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [doc.content, doc.path, theme, systemDark]);

  return (
    <div
      ref={ref}
      className="preview markdown-body"
      style={{ fontSize: previewFontSize }}
      onClick={(e) => void onPreviewClick(e, doc.path)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
