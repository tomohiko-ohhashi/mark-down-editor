import { useDocStore, selectActiveDoc, isDirty } from "../store/useDocStore";
import { useSettings } from "../store/useSettings";
import { t } from "../i18n";
import { IconWarning } from "./icons";

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
  const docs = useDocStore((s) => s.docs);
  const autosaveErrors = useDocStore((s) => s.autosaveErrors);
  const autosaveOn = useSettings((s) => s.autosaveSeconds > 0);
  // Only what is still true: the document is open, still has unsaved changes, and autosave is on.
  const autosaveError = autosaveOn
    ? docs
        .filter((d) => autosaveErrors[d.id] && isDirty(d))
        .map((d) => autosaveErrors[d.id])
        .join("\n")
    : "";
  const { lines, chars, words } = countStats(doc.content);
  return (
    <footer className="statusbar">
      <span className="statusbar-path">{doc.path ?? t("未保存のドキュメント")}</span>
      {autosaveError && (
        <span className="statusbar-error" title={autosaveError}>
          <IconWarning /> {t("自動保存できません")}
        </span>
      )}
      {typewriter && <span>{t("タイプライター")}</span>}
      {cursor.selected > 0 && <span>{t("{0} 文字を選択中", cursor.selected)}</span>}
      <span title={t("カーソル位置")}>
        {t("{0} 行目 {1} 列", cursor.line, cursor.col)}
      </span>
      <span>{lines === 1 ? t("全 1 行") : t("全 {0} 行", lines)}</span>
      <span>{words === 1 ? t("1 語") : t("{0} 語", words)}</span>
      <span>{chars === 1 ? t("1 文字") : t("{0} 文字", chars)}</span>
      <span title={t("文字コード")}>{doc.encoding}</span>
    </footer>
  );
}
