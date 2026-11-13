import { useDocStore } from "../store/useDocStore";
import { useSettings, hasUnsavedSettings, type Theme, type ListContinuation, type SmartPaste } from "../store/useSettings";
import { checkForUpdates } from "../features/updater";
import { availableFonts } from "../features/fonts";
import type { FontInfo } from "../platform/types";
import { useEffect, useState } from "react";
import type { LanguageSetting } from "../i18n";
import { t } from "../i18n";

const inTauri = "__TAURI_INTERNALS__" in window;

/** Pick a font from the ones this computer has. `monoFirst` lists fixed-pitch fonts first (editor). */
function FontSelect(props: { value: string; fonts: FontInfo[] | null; monoFirst: boolean; onChange: (v: string) => void }) {
  const { value, fonts, monoFirst, onChange } = props;
  const mono = (fonts ?? []).filter((f) => f.monospace);
  const other = (fonts ?? []).filter((f) => !f.monospace);
  const group = (label: string, list: FontInfo[]) =>
    list.length > 0 && (
      <optgroup label={label} key={label}>
        {list.map((f) => (
          <option key={f.name} value={f.name}>
            {f.label === f.name ? f.name : `${f.label} (${f.name})`}
          </option>
        ))}
      </optgroup>
    );
  const groups = [group(t("等幅フォント"), mono), group(t("その他のフォント"), other)];
  // A font that is not installed (any more), or a hand-written list from an older version.
  const unknown = value !== "" && !(fonts ?? []).some((f) => f.name === value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("既定")}</option>
      {unknown && <option value={value}>{value}</option>}
      {fonts == null && <option disabled>{t("フォントを読み込み中…")}</option>}
      {monoFirst ? groups : groups.reverse()}
    </select>
  );
}

export function SettingsDialog() {
  const open = useDocStore((s) => s.settingsOpen);
  const toggle = useDocStore((s) => s.toggle);
  const s = useSettings();
  const [fonts, setFonts] = useState<FontInfo[] | null>(null);
  useEffect(() => {
    if (!open || fonts) return;
    let cancelled = false;
    void availableFonts().then((list) => {
      if (!cancelled) setFonts(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open, fonts]);

  // Changes show at once but are only kept by "Save". Every other way out
  // (Cancel, ×, Esc, clicking outside, the shortcut) puts the saved values back.
  useEffect(() => {
    if (!open) return;
    return () => useSettings.getState().cancelPreview();
  }, [open]);
  if (!open) return null;
  const dirty = hasUnsavedSettings();
  const save = () => {
    s.commitPreview();
    toggle("settingsOpen");
  };

  const num = (key: "editorFontSize" | "previewFontSize" | "tabSize" | "autosaveSeconds", min: number, max: number) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = Number(e.target.value);
      if (!Number.isFinite(v)) return;
      s.preview({ [key]: Math.max(min, Math.min(max, v)) });
    };

  return (
    <div className="modal-backdrop" onMouseDown={() => toggle("settingsOpen")}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={t("設定")}>
        <div className="modal-header">
          <h2>{t("設定")}</h2>
          <button onClick={() => toggle("settingsOpen")} title={t("閉じる (Esc)")}>×</button>
        </div>
        <div className="modal-body">
          <section>
            <h3>{t("外観")}</h3>
            <label>
              {/* Written in both languages so it can be found whichever one is showing. */}
              言語 / Language
              <select value={s.language} onChange={(e) => s.preview({ language: e.target.value as LanguageSetting })}>
                <option value="system">{t("OS に合わせる")}</option>
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              {t("テーマ")}
              <select value={s.theme} onChange={(e) => s.preview({ theme: e.target.value as Theme })}>
                <option value="system">{t("OS に合わせる")}</option>
                <option value="light">{t("ライト")}</option>
                <option value="dark">{t("ダーク")}</option>
              </select>
            </label>
            <label>
              {t("エディタのフォントサイズ")}
              <input type="number" min={9} max={40} value={s.editorFontSize} onChange={num("editorFontSize", 9, 40)} />
            </label>
            <label>
              {t("エディタのフォント")}
              <FontSelect value={s.editorFontFamily} fonts={fonts} monoFirst onChange={(v) => s.preview({ editorFontFamily: v })} />
            </label>
            <label>
              {t("プレビューのフォントサイズ")}
              <input type="number" min={9} max={40} value={s.previewFontSize} onChange={num("previewFontSize", 9, 40)} />
            </label>
            <label>
              {t("プレビューのフォント")}
              <FontSelect value={s.previewFontFamily} fonts={fonts} monoFirst={false} onChange={(v) => s.preview({ previewFontFamily: v })} />
            </label>
          </section>
          <section>
            <h3>{t("エディタ")}</h3>
            <label>
              {t("タブ幅")}
              <select value={s.tabSize} onChange={num("tabSize", 1, 8)}>
                {[2, 4, 8].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={s.lineWrap} onChange={(e) => s.preview({ lineWrap: e.target.checked })} />
              {t("行を折り返す")}
            </label>
            <label>
              {t("リスト・引用の継続")}
              <select value={s.listContinuation} onChange={(e) => s.preview({ listContinuation: e.target.value as ListContinuation })}>
                <option value="shift">{t("Shift+Enter で継続 (Enter は通常の改行)")}</option>
                <option value="enter">{t("Enter で継続 (空の項目で解除)")}</option>
                <option value="off">{t("しない")}</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={s.livePreview} onChange={(e) => s.preview({ livePreview: e.target.checked })} />
              {t("カーソル行以外で Markdown 記号を隠す (WYSIWYG 風)")}
            </label>
            <label>
              {t("URL を選択範囲に貼り付けたとき")}
              <select value={s.smartPaste} onChange={(e) => s.preview({ smartPaste: e.target.value as SmartPaste })}>
                <option value="always">{t("常にリンクにする")}</option>
                <option value="ask">{t("毎回確認する")}</option>
                <option value="off">{t("そのまま貼り付ける")}</option>
              </select>
            </label>
            <label>
              {t("自動保存")}
              <select value={s.autosaveSeconds} onChange={num("autosaveSeconds", 0, 600)}>
                <option value={0}>{t("しない")}</option>
                <option value={5}>{t("5 秒ごと")}</option>
                <option value={30}>{t("30 秒ごと")}</option>
                <option value={120}>{t("2 分ごと")}</option>
              </select>
            </label>
          </section>
          <section>
            <h3>{t("起動")}</h3>
            <label className="check">
              <input type="checkbox" checked={s.reopenLastFiles} onChange={(e) => s.preview({ reopenLastFiles: e.target.checked })} />
              {t("前回終了時の状態を復元する (開いていたファイル・フォルダ・表示)")}
            </label>
            <label className="check">
              <input type="checkbox" checked={s.restoreUnsaved} onChange={(e) => s.preview({ restoreUnsaved: e.target.checked })} />
              {t("保存していない変更を、次回の起動時に復元する")}
            </label>
            <label className="check sub">
              <input
                type="checkbox"
                disabled={!s.restoreUnsaved}
                checked={s.restoreUnsaved && s.quitWithoutAsking}
                onChange={(e) => s.preview({ quitWithoutAsking: e.target.checked })}
              />
              {t("復元する場合、終了時に確認しない")}
            </label>
            <label className="check">
              <input type="checkbox" checked={s.checkUpdatesOnStartup} onChange={(e) => s.preview({ checkUpdatesOnStartup: e.target.checked })} />
              {t("起動時にアップデートを確認する")}
            </label>
            {inTauri && (
              <button className="secondary" onClick={() => void checkForUpdates(false)}>{t("今すぐ更新を確認")}</button>
            )}
          </section>
        </div>
        <div className="modal-footer">
          <span className="modal-footer-note">{dirty ? t("保存するまで設定は記録されません") : ""}</span>
          <button className="secondary" onClick={() => toggle("settingsOpen")} title={t("変更を元に戻して閉じる (Esc)")}>
            {t("キャンセル")}
          </button>
          <button className="primary" onClick={save} title={t("設定を保存して閉じる")}>
            {t("保存")}
          </button>
        </div>
      </div>
    </div>
  );
}
