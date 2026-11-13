import { useMemo } from "react";
import { useDocStore, selectActiveDoc } from "../store/useDocStore";
import { revealLine } from "../features/reveal";
import { t } from "../i18n";

interface Heading {
  level: number;
  text: string;
  line: number;
}

const SETEXT_RE = /^\s{0,3}(=+|-+)\s*$/;
const NOT_SETEXT_TEXT = /^\s*([-*+>#|]|\d+[.)]\s|```|~~~)/;

/** Extract ATX (`# x`) and single-line setext (`x` over `===` / `---`) headings, skipping code fences and front matter. */
export function extractHeadings(src: string): Heading[] {
  const out: Heading[] = [];
  let fence: string | null = null;
  const lines = src.split("\n");
  let start = 0;
  if (/^(---|\+\+\+)\s*$/.test(lines[0] ?? "")) {
    const close = lines.findIndex((l, i) => i > 0 && l.trim() === lines[0].trim());
    if (close > 0) start = close + 1;
  }
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (line.trim().startsWith(fence.repeat(3))) fence = null;
      continue;
    }
    if (fence) continue;
    const m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) {
      out.push({ level: m[1].length, text: m[2] || t("(無題)"), line: i + 1 });
      continue;
    }
    const s = SETEXT_RE.exec(line);
    const prev = i > start ? lines[i - 1] : "";
    const before = i - 2 >= start ? lines[i - 2] : "";
    if (s && prev.trim() !== "" && before.trim() === "" && !NOT_SETEXT_TEXT.test(prev)) {
      out.push({ level: s[1][0] === "=" ? 1 : 2, text: prev.trim(), line: i });
    }
  }
  return out;
}

export function Outline() {
  const content = useDocStore((s) => selectActiveDoc(s).content);
  const headings = useMemo(() => extractHeadings(content), [content]);
  return (
    <aside className="outline">
      <div className="panel-title">{t("アウトライン")}</div>
      {headings.length === 0 ? (
        <div className="panel-empty">{t("見出しがありません")}</div>
      ) : (
        <ul>
          {headings.map((h, i) => (
            <li key={i} style={{ paddingLeft: 8 + (h.level - 1) * 12 }} className={`h${h.level}`}>
              <button
                onClick={() => {
                  revealLine(h.line);
                  // On phones the outline covers the text; get out of the way.
                  if (window.innerWidth < 768) useDocStore.getState().set({ showOutline: false });
                }}
                title={t("{0} 行目へ移動", h.line)}
              >
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
