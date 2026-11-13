import { useDocStore } from "../store/useDocStore";
import { useSettings, type Theme, type ListContinuation, type SmartPaste } from "../store/useSettings";
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
  if (!open) return null;

  const num = (key: "editorFontSize" | "previewFontSize" | "tabSize" | "autosaveSeconds", min: number, max: number) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = Number(e.target.value);
      if (!Number.isFinite(v)) return;
      s.update({ [key]: Math.max(min, Math.min(max, v)) });
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
              <select value={s.language} onChange={(e) => s.update({ language: e.target.value as LanguageSetting })}>
                <option value="system">{t("OS に合わせる")}</option>
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              {t("テーマ")}
              <select value={s.theme} onChange={(e) => s.update({ theme: e.target.value as Theme })}>
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
              <FontSelect value={s.editorFontFamily} fonts={fonts} monoFirst onChange={(v) => s.update({ editorFontFamily: v })} />
            </label>
            <label>
              {t("プレビューのフォントサイズ")}
              <input type="number" min={9} max={40} value={s.previewFontSize} onChange={num("previewFontSize", 9, 40)} />
            </label>
            <label>
              {t("プレビューのフォント")}
              <FontSelect value={s.previewFontFamily} fonts={fonts} monoFirst={false} onChange={(v) => s.update({ previewFontFamily: v })} />
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
              <input type="checkbox" checked={s.lineWrap} onChange={(e) => s.update({ lineWrap: e.target.checked })} />
              {t("行を折り返す")}
            </label>
            <label>
              {t("リスト・引用の継続")}
              <select value={s.listContinuation} onChange={(e) => s.update({ listContinuation: e.target.value as ListContinuation })}>
                <option value="shift">{t("Shift+Enter で継続 (Enter は通常の改行)")}</option>
                <option value="enter">{t("Enter で継続 (空の項目で解除)")}</option>
                <option value="off">{t("しない")}</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={s.livePreview} onChange={(e) => s.update({ livePreview: e.target.checked })} />
              {t("カーソル行以外で Markdown 記号を隠す (WYSIWYG 風)")}
            </label>
            <label>
              {t("URL を選択範囲に貼り付けたとき")}
              <select value={s.smartPaste} onChange={(e) => s.update({ smartPaste: e.target.value as SmartPaste })}>
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
              <input type="checkbox" checked={s.reopenLastFiles} onChange={(e) => s.update({ reopenLastFiles: e.target.checked })} />
              {t("前回終了時の状態を復元する (開いていたファイル・フォルダ・表示)")}
            </label>
            <label className="check">
              <input type="checkbox" checked={s.checkUpdatesOnStartup} onChange={(e) => s.update({ checkUpdatesOnStartup: e.target.checked })} />
              {t("起動時にアップデートを確認する")}
            </label>
            {inTauri && (
              <button className="secondary" onClick={() => void checkForUpdates(false)}>{t("今すぐ更新を確認")}</button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
