import { useMemo } from "react";
import { useDocStore, selectActiveDoc } from "../store/useDocStore";
import { goToLine } from "../editor/Editor";

interface Heading {
  level: number;
  text: string;
  line: number;
}

/** Extract ATX headings, skipping fenced code blocks. */
export function extractHeadings(src: string): Heading[] {
  const out: Heading[] = [];
  let fence: string | null = null;
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (line.trim().startsWith(fence.repeat(3))) fence = null;
      continue;
    }
    if (fence) continue;
    const m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2] || "(無題)", line: i + 1 });
  }
  return out;
}

export function Outline() {
  const content = useDocStore((s) => selectActiveDoc(s).content);
  const headings = useMemo(() => extractHeadings(content), [content]);
  return (
    <aside className="outline">
      <div className="panel-title">アウトライン</div>
      {headings.length === 0 ? (
        <div className="panel-empty">見出しがありません</div>
      ) : (
        <ul>
          {headings.map((h, i) => (
            <li key={i} style={{ paddingLeft: 8 + (h.level - 1) * 12 }} className={`h${h.level}`}>
              <button onClick={() => goToLine(h.line)} title={`${h.line} 行目`}>
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
