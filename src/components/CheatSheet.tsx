import { useState } from "react";
import { useDocStore } from "../store/useDocStore";

const isMac = navigator.platform.toUpperCase().includes("MAC");
const mod = isMac ? "⌘" : "Ctrl";
const shift = isMac ? "⇧" : "Shift";
const k = (...keys: string[]) => keys.join(isMac ? "" : "+");

const SYNTAX: [string, string][] = [
  ["# 見出し1 / ## 見出し2 / ### 見出し3", "見出し（# の数でレベル、# の後に半角スペース）"],
  ["**太字**  _斜体_  ~~取り消し線~~", "強調"],
  ["`コード`", "インラインコード"],
  ["```js\nコード\n```", "コードブロック（言語名でハイライト）"],
  ["- 項目\n- 項目\n  - ネスト", "箇条書き"],
  ["1. 項目\n2. 項目", "番号付きリスト"],
  ["- [ ] 未完了\n- [x] 完了", "タスクリスト"],
  ["> 引用", "引用"],
  ["[テキスト](https://example.com)", "リンク"],
  ["![代替テキスト](assets/image.png)", "画像（貼り付け/ドロップで自動挿入）"],
  ["| 列1 | 列2 |\n| --- | --- |\n| a | b |", "表"],
  ["---", "水平線"],
  ["$E = mc^2$", "インライン数式（KaTeX）"],
  ["$$\n\\int_0^1 x^2 dx\n$$", "ブロック数式"],
  ["```mermaid\ngraph LR\n  A --> B\n```", "Mermaid 図"],
  ["脚注[^1]\n\n[^1]: 注の本文", "脚注"],
  ["行末にスペース2つ  ", "改行"],
];

const SHORTCUTS: [string, string][] = [
  [k(mod, "N"), "新規タブ"],
  [k(mod, "O"), "ファイルを開く"],
  [k(mod, "S"), "保存"],
  [k(mod, shift, "S"), "名前を付けて保存"],
  [k(mod, "W"), "タブを閉じる"],
  [`${k("Ctrl", "Tab")} / ${k("Ctrl", shift, "Tab")}`, "次 / 前のタブ"],
  [k(mod, "F"), "検索・置換"],
  [k(mod, "Z") + " / " + k(mod, shift, "Z"), "元に戻す / やり直す"],
  [k(mod, "B") + " / " + k(mod, "I") + " / " + k(mod, "E"), "太字 / 斜体 / コード"],
  [k(mod, "K"), "リンクを挿入"],
  [k(mod, "1") + " / " + k(mod, "2") + " / " + k(mod, "3"), "見出し 1 / 2 / 3 の切替"],
  [k(mod, shift, "1") + " / 2 / 3", "編集 / 分割 / プレビュー表示"],
  [k(mod, shift, "E"), "サイドバー（フォルダ）"],
  [k(mod, shift, "O"), "アウトライン"],
  [k(mod, shift, "F"), "フォーカスモード"],
  [k(mod, shift, "T"), "タイプライターモード"],
  [k(mod, shift, "H"), "HTML を書き出す"],
  [k(mod, "P"), "印刷 / PDF"],
  [k(mod, ","), "設定"],
  ["F1 / " + k(mod, shift, "/"), "このチートシート"],
  ["Esc", "フォーカスモード / パネルを閉じる"],
];

export function CheatSheet() {
  const open = useDocStore((s) => s.cheatSheetOpen);
  const toggle = useDocStore((s) => s.toggle);
  const [tab, setTab] = useState<"syntax" | "keys">("syntax");
  if (!open) return null;
  const rows = tab === "syntax" ? SYNTAX : SHORTCUTS;
  return (
    <div className="modal-backdrop" onMouseDown={() => toggle("cheatSheetOpen")}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="チートシート">
        <div className="modal-header">
          <h2>チートシート</h2>
          <div className="segmented">
            <button className={tab === "syntax" ? "active" : ""} onClick={() => setTab("syntax")}>Markdown 記法</button>
            <button className={tab === "keys" ? "active" : ""} onClick={() => setTab("keys")}>ショートカット</button>
          </div>
          <button onClick={() => toggle("cheatSheetOpen")} title="閉じる (Esc)">×</button>
        </div>
        <div className="modal-body">
          <table className="cheat">
            <tbody>
              {rows.map(([a, b]) => (
                <tr key={a}>
                  <td>{tab === "syntax" ? <pre>{a}</pre> : <kbd>{a}</kbd>}</td>
                  <td>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
