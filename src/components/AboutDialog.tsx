import { useDocStore } from "../store/useDocStore";
import { platform, inTauri } from "../platform";
import { checkForUpdates } from "../features/updater";
import { t } from "../i18n";
import { version } from "../../package.json";
import { useEffect, useState } from "react";

const REPO = "https://github.com/tomohiko-ohhashi/mark-down-editor";

/** The main libraries the app is built on (each under its own license). */
const BUILT_WITH = ["Tauri", "React", "CodeMirror", "unified (remark / rehype)", "KaTeX", "Mermaid", "highlight.js", "zustand"];

/** "About" box: version, copyright and where the app comes from. */
export function AboutDialog() {
  const open = useDocStore((s) => s.aboutOpen);
  const toggle = useDocStore((s) => s.toggle);
  // The license texts of the bundled libraries: null = not shown, "" = loading.
  const [licenses, setLicenses] = useState<string | null>(null);
  // Closed from elsewhere (Esc): start from the first page next time.
  useEffect(() => {
    if (!open) setLicenses(null);
  }, [open]);
  if (!open) return null;
  const close = () => {
    setLicenses(null);
    toggle("aboutOpen");
  };
  const showLicenses = () => {
    setLicenses("");
    fetch("/THIRD-PARTY-LICENSES.txt")
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(setLicenses, () => setLicenses(t("ライセンス一覧を読み込めませんでした")));
  };
  if (licenses !== null) {
    return (
      <div className="modal-backdrop" onMouseDown={close}>
        <div className="modal licenses" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={t("ライブラリのライセンス")}>
          <div className="modal-header">
            <h2>{t("ライブラリのライセンス")}</h2>
            <button onClick={close} title={t("閉じる (Esc)")}>×</button>
          </div>
          <pre className="licenses-text" tabIndex={0}>{licenses || t("読み込み中…")}</pre>
          <div className="modal-footer">
            <span className="modal-footer-note" />
            <button className="secondary" onClick={() => setLicenses(null)}>{t("戻る")}</button>
            <button className="primary" onClick={close}>{t("閉じる")}</button>
          </div>
        </div>
      </div>
    );
  }
  const link = (url: string, label: string) => (
    <a
      href={url}
      onClick={(e) => {
        e.preventDefault();
        void platform.openExternal(url);
      }}
    >
      {label}
    </a>
  );
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal about" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={t("バージョン情報")}>
        <div className="modal-header">
          <h2>{t("バージョン情報")}</h2>
          <button onClick={close} title={t("閉じる (Esc)")}>×</button>
        </div>
        <div className="modal-body">
          <div className="about-name">Markdown Editor</div>
          <div className="about-version">
            {t("バージョン {0}", version)} · {inTauri ? t("デスクトップ版") : t("Web 版")}
          </div>
          <p>{t("macOS / Linux / Windows で動く Markdown エディタです。")}</p>
          <p className="about-links">
            {link(REPO, "GitHub")} · {link(`${REPO}/releases`, t("リリース一覧"))} · {link(`${REPO}/blob/main/LICENSE`, t("ライセンス"))}
          </p>
          <h3>{t("権利表記")}</h3>
          <p>Copyright © 2026 tomohiko-ohhashi. All rights reserved.</p>
          <p className="about-note">
            {t("オープンソースライセンスでは公開していません。許可なく使用・複製・改変・再配布することはできません。")}
          </p>
          <h3>{t("利用しているライブラリ")}</h3>
          <p className="about-note">
            {BUILT_WITH.join(" · ")}
            <br />
            {t("各ライブラリには、それぞれのライセンスが適用されます。")}
          </p>
          <p>
            <button className="link" onClick={showLicenses}>{t("すべてのライブラリとライセンス文を表示")}</button>
          </p>
        </div>
        <div className="modal-footer">
          {inTauri && (
            <button className="secondary" onClick={() => void checkForUpdates(false)}>
              {t("今すぐ更新を確認")}
            </button>
          )}
          <span className="modal-footer-note" />
          <button className="primary" onClick={close}>
            {t("閉じる")}
          </button>
        </div>
      </div>
    </div>
  );
}
