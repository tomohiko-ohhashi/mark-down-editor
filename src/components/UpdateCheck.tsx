import { useState } from "react";
import { checkForUpdates, type UpdateCheckResult } from "../features/updater";
import { t } from "../i18n";
import { version } from "../../package.json";

/** "Check for updates now" with the outcome shown next to the button. */
export function UpdateCheck() {
  const [state, setState] = useState<"idle" | "checking" | UpdateCheckResult>("idle");
  const run = () => {
    setState("checking");
    void checkForUpdates(false).then(setState);
  };
  const note =
    state === "checking"
      ? t("確認中…")
      : state === "latest"
        ? t("最新バージョンです ({0})", version)
        : state === "error"
          ? t("更新を確認できませんでした")
          : state === "later"
            ? t("新しいバージョンがあります (あとで更新)")
            : "";
  return (
    <span className="update-check">
      <button className="secondary" onClick={run} disabled={state === "checking"}>
        {t("今すぐ更新を確認")}
      </button>
      <span className={`update-note ${state === "error" ? "error" : ""}`} role="status">
        {state === "latest" ? "✓ " : ""}
        {note}
      </span>
    </span>
  );
}
