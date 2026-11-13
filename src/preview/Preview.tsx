import { useEffect, useRef, useState } from "react";
import { fontFamilyCss, SANS_FALLBACK } from "../features/fonts";
import { renderMarkdown } from "./markdown";
import { useDocStore, selectActiveDoc, dirName } from "../store/useDocStore";
import { useSettings, isDarkTheme } from "../store/useSettings";
import { useScrollSync } from "./useScrollSync";
import { openDocument } from "../features/files/fileOps";
import { joinPath, isAbsolutePath } from "./paths";
import { platform } from "../platform";
import { scrollPreviewToLine } from "../features/reveal";
import { toggleTaskAtLine } from "../editor/tasks";
import { pauseScrollSync } from "./useScrollSync";
import { cursorLine, goToLine } from "../editor/Editor";

/**
 * Links in the rendered HTML must not navigate the webview itself:
 * external URLs open in the system browser, #anchors scroll the preview,
 * and relative Markdown links open the target file in a tab.
 */
/** 1-based source line of the block an element of the preview belongs to. */
function sourceLineOf(el: HTMLElement): number | null {
  const line = Number(el.closest<HTMLElement>("[data-line]")?.dataset.line);
  return Number.isFinite(line) && line > 0 ? line : null;
}

async function onPreviewClick(e: React.MouseEvent<HTMLDivElement>, docPath: string | null) {
  const target = e.target as HTMLElement;
  if (target instanceof HTMLInputElement && target.type === "checkbox") {
    // Tick the task in the source; the preview follows from there. If the
    // line cannot be found, leave the box as it was.
    const line = sourceLineOf(target);
    if (line == null || !toggleTaskAtLine(line)) e.preventDefault();
    return;
  }
  const a = target.closest("a");
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
  const previewFont = useSettings((s) => s.previewFontFamily);
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

  // Rendering waits for a short pause in typing, but another tab is shown at
  // once, and during a long burst of typing the preview still catches up every
  // now and then instead of standing still until the burst ends.
  const timing = useRef({ shownDoc: null as string | null, pendingSince: null as number | null, seq: 0, applied: 0, cost: 0 });
  const activeId = useRef(doc.id);
  activeId.current = doc.id;
  useEffect(() => {
    const t = timing.current;
    const now = Date.now();
    t.pendingSince ??= now;
    const maxWait = Math.max(500, t.cost * 4);
    const delay = t.shownDoc !== doc.id ? 0 : Math.min(120, Math.max(0, maxWait - (now - t.pendingSince)));
    const timer = setTimeout(() => {
      t.pendingSince = null;
      const content = doc.content;
      const id = doc.id;
      const seq = ++t.seq;
      const started = Date.now();
      void renderMarkdown(content, {
        docDir: doc.path != null ? dirName(doc.path) : null,
        sourceLines: true,
        mermaid: true,
        dark: isDarkTheme(),
      }).then((h) => {
        t.cost = Date.now() - started;
        // A newer render already landed, or the user moved to another tab meanwhile.
        if (seq < t.applied || activeId.current !== id) return;
        t.applied = seq;
        t.shownDoc = id;
        setHtml(h);
        rendered.current = content;
        setRenderTick((n) => n + 1);
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [doc.id, doc.content, doc.path, theme, systemDark]);

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
      style={{ fontSize: previewFontSize, fontFamily: fontFamilyCss(previewFont, SANS_FALLBACK) ?? undefined }}
      onClick={(e) => void onPreviewClick(e, doc.path)}
      onDoubleClick={(e) => {
        // Find this spot in the source: the editor cursor moves to the block's line.
        const line = sourceLineOf(e.target as HTMLElement);
        if (line == null) return;
        pauseScrollSync(700);
        goToLine(line, false);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
