import type { EditorView } from "@codemirror/view";
import { useSettings } from "../store/useSettings";
import { platform } from "../platform";
import { t } from "../i18n";

const URL_RE = /^(https?:\/\/|mailto:)[^\s<>"']+$/i;

/**
 * When a URL is pasted over a non-empty selection, turn the selection into a
 * Markdown link. Behaviour follows the `smartPaste` setting: always / ask / off.
 * Returns true when the paste was handled here.
 */
export function handleSmartPaste(event: ClipboardEvent, view: EditorView): boolean {
  const mode = useSettings.getState().smartPaste;
  if (mode === "off") return false;
  const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
  if (!URL_RE.test(text)) return false;
  const { from, to } = view.state.selection.main;
  if (from === to) return false;
  const selected = view.state.sliceDoc(from, to);
  if (selected.includes("\n")) return false;
  event.preventDefault();

  const insertLink = () => {
    const insert = `[${selected}](${text})`;
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, userEvent: "input.paste" });
  };
  const insertPlain = () => {
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: "input.paste" });
  };

  if (mode === "always") {
    insertLink();
    return true;
  }
  void platform
    .ask(t("「{0}」をこの URL へのリンクにしますか？\n{1}", selected, text), {
      title: t("スマートペースト"),
      okLabel: t("リンクにする"),
      cancelLabel: t("そのまま貼り付け"),
    })
    .then((yes) => {
      if (yes) insertLink();
      else insertPlain();
      view.focus();
    });
  return true;
}
