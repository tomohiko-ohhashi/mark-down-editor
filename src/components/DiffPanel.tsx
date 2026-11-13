import { useEffect, useMemo, useRef, useState } from "react";
import { useDocStore, selectActiveDoc, fileName } from "../store/useDocStore";
import { sideBySide, changedSpan, changeStarts, type DiffRow } from "../features/diff";
import { goToLine } from "../editor/Editor";
import { t } from "../i18n";

type Base = "opened" | "saved";

/** One side of a changed line with the differing part marked. */
function Marked({ text, from, to }: { text: string; from: number; to: number }) {
  if (from >= to) return <>{text}</>;
  return (
    <>
      {text.slice(0, from)}
      <mark>{text.slice(from, to)}</mark>
      {text.slice(to)}
    </>
  );
}

function Row({ row, index, onJump }: { row: DiffRow; index: number; onJump: (line: number) => void }) {
  const [start, endOld, endNew] = row.kind === "change" ? changedSpan(row.leftText, row.rightText) : [0, 0, 0];
  const target = row.right ?? row.left ?? 1;
  return (
    <div className={`diff-row diff-${row.kind}`} data-row={index} onDoubleClick={() => onJump(target)} title={t("ダブルクリックでエディタのこの行へ移動")}>
      <span className="diff-no">{row.left ?? ""}</span>
      <span className="diff-text diff-left">{row.kind === "change" ? <Marked text={row.leftText} from={start} to={endOld} /> : row.leftText}</span>
      <span className="diff-no">{row.right ?? ""}</span>
      <span className="diff-text diff-right">{row.kind === "change" ? <Marked text={row.rightText} from={start} to={endNew} /> : row.rightText}</span>
    </div>
  );
}

/**
 * Side-by-side view of what changed in the active document: against the text
 * it had when first opened since the app started, or against the saved file.
 * Old text on the left, current text on the right, like a merge tool.
 */
export function DiffPanel() {
  const doc = useDocStore(selectActiveDoc);
  const toggle = useDocStore((s) => s.toggle);
  const [base, setBase] = useState<Base>("opened");
  const [current, setCurrent] = useState(-1);
  const body = useRef<HTMLDivElement>(null);

  const oldText = base === "opened" ? doc.originalContent : doc.savedContent;
  const rows = useMemo(() => sideBySide(oldText, doc.content), [oldText, doc.content]);
  const starts = useMemo(() => changeStarts(rows), [rows]);
  const added = rows.filter((r) => r.kind === "add" || r.kind === "change").length;
  const removed = rows.filter((r) => r.kind === "del" || r.kind === "change").length;

  const show = (i: number) => {
    if (starts.length === 0) return;
    const n = (i + starts.length) % starts.length;
    setCurrent(n);
    body.current?.querySelector(`[data-row="${starts[n]}"]`)?.scrollIntoView({ block: "center" });
  };
  // Start at the first change whenever the comparison changes.
  useEffect(() => {
    setCurrent(-1);
    if (starts.length > 0) requestAnimationFrame(() => show(0));
    else if (body.current) body.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, doc.id]);

  const close = () => toggle("diffOpen");
  const jump = (line: number) => {
    close();
    // The editor is hidden while this view is open; move once it is laid out again.
    requestAnimationFrame(() => requestAnimationFrame(() => goToLine(line)));
  };

  return (
    <section className="diff" aria-label={t("変更箇所")}>
      <div className="diff-head">
        <strong>{t("変更箇所")}</strong>
        <span className="diff-file">{fileName(doc.path)}</span>
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={base === "opened"} className={base === "opened" ? "active" : ""} onClick={() => setBase("opened")} title={t("アプリを起動してから最初に開いたときの内容と比べる")}>
            {t("最初に開いたときと比較")}
          </button>
          <button role="tab" aria-selected={base === "saved"} className={base === "saved" ? "active" : ""} onClick={() => setBase("saved")} title={t("ファイルに保存されている内容と比べる")}>
            {t("保存済みの内容と比較")}
          </button>
        </div>
        <span className="diff-count">
          {starts.length === 0
            ? t("違いはありません")
            : starts.length === 1
              ? t("1 箇所 (+{0} 行 / −{1} 行)", added, removed)
              : t("{0} 箇所 (+{1} 行 / −{2} 行)", starts.length, added, removed)}
        </span>
        <span className="diff-nav">
          <button onClick={() => show(current - 1)} disabled={starts.length === 0} title={t("前の変更")}>↑</button>
          <span>{starts.length === 0 ? "0 / 0" : `${Math.max(current, 0) + 1} / ${starts.length}`}</span>
          <button onClick={() => show(current + 1)} disabled={starts.length === 0} title={t("次の変更")}>↓</button>
        </span>
        <button className="diff-close" onClick={close} title={t("閉じる (Esc)")}>×</button>
      </div>
      <div className="diff-cols">
        <span>{base === "opened" ? t("最初に開いたとき") : t("保存済み")}</span>
        <span>{t("現在")}</span>
      </div>
      <div className="diff-body" ref={body} tabIndex={0}>
        {rows.map((row, i) => (
          <Row key={i} row={row} index={i} onJump={jump} />
        ))}
      </div>
    </section>
  );
}
