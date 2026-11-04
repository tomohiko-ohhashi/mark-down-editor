import { flashStatus } from "../store/useDocStore";
import { platform, inTauri } from "../platform";

const { ask, message } = platform;

/**
 * Check GitHub Releases for a newer version. When `silent` is true (startup
 * check), nothing is shown unless an update exists.
 */
export async function checkForUpdates(silent = false): Promise<void> {
  if (!inTauri) return;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      if (!silent) flashStatus("最新バージョンです");
      return;
    }
    const go = await ask(
      `新しいバージョン ${update.version} が利用できます（現在: ${update.currentVersion}）。\n今すぐダウンロードして更新しますか？`,
      { title: "アップデート", kind: "info", okLabel: "更新する", cancelLabel: "あとで" },
    );
    if (!go) return;
    flashStatus("ダウンロード中…", 60000);
    await update.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    const restart = await ask("更新をインストールしました。再起動しますか？", {
      title: "アップデート",
      kind: "info",
      okLabel: "再起動",
      cancelLabel: "あとで",
    });
    if (restart) await relaunch();
  } catch (e) {
    if (!silent) await message(`更新を確認できませんでした: ${e}`, { title: "アップデート", kind: "warning" });
  }
}
