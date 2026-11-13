import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "./markdown";
import { useDocStore, selectActiveDoc, dirName } from "../store/useDocStore";
import { useSettings, isDarkTheme } from "../store/useSettings";
import { useScrollSync } from "./useScrollSync";
import { openDocument } from "../features/files/fileOps";
import { joinPath, isAbsolutePath } from "./paths";
import { platform } from "../platform";
import { scrollPreviewToLine } from "../features/reveal";
import { pauseScrollSync } from "./useScrollSync";
import { cursorLine } from "../editor/Editor";

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
  /** Bumped after every finished render; `rendered` is the text that render was for. */
  const [renderTick, setRenderTick] = useState(0);
  const rendered = useRef<string | null>(null);
  const reveal = useDocStore((s) => s.reveal);
  const viewMode = useDocStore((s) => s.viewMode);
  const prevMode = useRef(viewMode);
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
      const content = doc.content;
      renderMarkdown(content, {
        docDir: doc.path != null ? dirName(doc.path) : null,
        sourceLines: true,
        mermaid: true,
        dark: isDarkTheme(),
      }).then((h) => {
        if (cancelled) return;
        setHtml(h);
        rendered.current = content;
        setRenderTick((t) => t + 1);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [doc.content, doc.path, theme, systemDark]);

  // Jump requested by the outline / search: wait until this document's HTML is on screen.
  useEffect(() => {
    if (!reveal || !ref.current) return;
    if (rendered.current !== doc.content) return;
    pauseScrollSync(400);
    scrollPreviewToLine(ref.current, reveal.line);
    useDocStore.setState({ reveal: null });
  }, [reveal, renderTick, doc.content]);

  // Coming from editor-only: the preview was hidden, so show the block the cursor is in.
  useEffect(() => {
    const was = prevMode.current;
    prevMode.current = viewMode;
    if (was !== "editor" || viewMode === "editor") return;
    const id = requestAnimationFrame(() => {
      if (!ref.current) return;
      pauseScrollSync(400);
      scrollPreviewToLine(ref.current, cursorLine());
    });
    return () => cancelAnimationFrame(id);
  }, [viewMode]);

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
