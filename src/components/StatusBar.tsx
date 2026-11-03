import { useDocStore } from "../store/useDocStore";

function countStats(text: string) {
  const lines = text.length === 0 ? 0 : text.split("\n").length;
  const chars = Array.from(text).length;
  // Count CJK characters individually and latin runs as words.
  const words =
    (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length +
    (text.match(/[A-Za-z0-9_'’-]+/g) ?? []).length;
  return { lines, chars, words };
}

export function StatusBar() {
  const content = useDocStore((s) => s.content);
  const path = useDocStore((s) => s.path);
  const { lines, chars, words } = countStats(content);
  return (
    <footer className="statusbar">
      <span className="statusbar-path">{path ?? "未保存のドキュメント"}</span>
      <span>{lines} 行</span>
      <span>{words} 語</span>
      <span>{chars} 文字</span>
    </footer>
  );
}
