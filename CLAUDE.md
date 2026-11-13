# このリポジトリで作業するときの決まり

## プルリクエスト

- PR は基本的に draft ではなく Open (レビュー可能) の状態で作る
- 作業ブランチは `develop`。マージされるとリモートの `develop` は消えるので、次の作業は最新の `main` から作り直す
- マージはリポジトリの持ち主が行う

## 変更するときに忘れやすいこと

- 画面の文言は `t("日本語の文")` で書き、英訳を `src/i18n/en.ts` に足す (足し忘れると `pnpm test` が落ちる)。`t()` はモジュールの読み込み時ではなく描画時に呼ぶ
- 依存ライブラリを変えたら `pnpm licenses` を実行して `public/THIRD-PARTY-LICENSES.txt` を更新する
- 確認は `pnpm build`、`pnpm test`、`pnpm e2e` (先に `pnpm server:build`)、Rust を触ったら `cargo fmt --all -- --check` と `cargo clippy --workspace -- -D warnings`

## リリース

1. バージョンを上げる PR (`package.json` / `src-tauri/tauri.conf.json` / `Cargo.toml`) をマージする
2. Actions の Release を手動で起動し、タグ名 (`vX.Y.Z`) を入力する
3. 全ジョブの完了後に、下書きリリースを公開する (公開は持ち主が行う)

経緯や詳しい手順は `docs/SUMMARY.md` にある。
