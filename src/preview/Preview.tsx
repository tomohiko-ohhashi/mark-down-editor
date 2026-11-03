import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "./markdown";
import { useDocStore, selectActiveDoc, dirName } from "../store/useDocStore";
import { useSettings, isDarkTheme } from "../store/useSettings";
import { useScrollSync } from "./useScrollSync";

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
        docDir: doc.path ? dirName(doc.path) : null,
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
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
