import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "./markdown";
import { useDocStore } from "../store/useDocStore";
import { useScrollSync } from "./useScrollSync";

export function Preview() {
  const content = useDocStore((s) => s.content);
  const [html, setHtml] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useScrollSync("preview", ref);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      renderMarkdown(content).then((h) => {
        if (!cancelled) setHtml(h);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [content]);

  return (
    <div
      ref={ref}
      className="preview markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
