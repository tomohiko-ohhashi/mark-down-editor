import { flashStatus } from "../store/useDocStore";
import { platform, inTauri } from "../platform";
import { t } from "../i18n";

const { ask, message } = platform;

/** How a check ended: already up to date, an update the user put off, an update installed, or a failed check. */
export type UpdateCheckResult = "latest" | "later" | "installed" | "error";

/**
 * Check GitHub Releases for a newer version. When `silent` is true (startup
 * check), nothing is shown unless an update exists.
 */
export async function checkForUpdates(silent = false): Promise<UpdateCheckResult> {
  if (!inTauri) return "error";
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      if (!silent) flashStatus(t("最新バージョンです"));
      return "latest";
    }
    const go = await ask(
      t("新しいバージョン {0} が利用できます（現在: {1}）。\n今すぐダウンロードして更新しますか？", update.version, update.currentVersion),
      { title: t("アップデート"), kind: "info", okLabel: t("更新する"), cancelLabel: t("あとで") },
    );
    if (!go) return "later";
    flashStatus(t("ダウンロード中…"), 60000);
    await update.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    const restart = await ask(t("更新をインストールしました。再起動しますか？"), {
      title: t("アップデート"),
      kind: "info",
      okLabel: t("再起動"),
      cancelLabel: t("あとで"),
    });
    if (restart) await relaunch();
    return "installed";
  } catch (e) {
    if (!silent) await message(t("更新を確認できませんでした: {0}", String(e)), { title: t("アップデート"), kind: "warning" });
    return "error";
  }
}
