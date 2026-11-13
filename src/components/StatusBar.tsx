import { useDocStore, selectActiveDoc } from "../store/useDocStore";

function countStats(text: string) {
  // An empty document still has its one (empty) line, where the cursor is.
  const lines = text.split("\n").length;
  const chars = Array.from(text).length;
  // Count CJK characters individually and latin runs as words.
  const words =
    (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length +
    (text.match(/[A-Za-z0-9_'’-]+/g) ?? []).length;
  return { lines, chars, words };
}

export function StatusBar() {
  const doc = useDocStore(selectActiveDoc);
  const typewriter = useDocStore((s) => s.typewriterMode);
  const cursor = useDocStore((s) => s.cursor);
  const { lines, chars, words } = countStats(doc.content);
  return (
    <footer className="statusbar">
      <span className="statusbar-path">{doc.path ?? "未保存のドキュメント"}</span>
      {typewriter && <span>タイプライター</span>}
      {cursor.selected > 0 && <span>{cursor.selected} 文字を選択中</span>}
      <span title="カーソル位置">
        {cursor.line} 行目 {cursor.col} 列
      </span>
      <span>全 {lines} 行</span>
      <span>{words} 語</span>
      <span>{chars} 文字</span>
    </footer>
  );
}
