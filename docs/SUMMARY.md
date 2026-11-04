# 開発のまとめ (2026-11)

このドキュメントは、Markdown Editor の立ち上げから v0.2.0 までの経緯、環境構築でつまずいた点とその対処、リリース手順、残っている作業をまとめたものです。

## 1. 何を作ったか

macOS / Linux / Windows で単独で動く Markdown エディタ。Tauri 2 (Rust) + React / TypeScript + CodeMirror 6 で実装。配布物はネイティブの .app / .exe / .AppImage / .deb / .rpm で、ブラウザやサーバー、Node.js は不要。

機能の一覧とショートカットは [README](../README.md)、計画と進捗は [PLAN.md](PLAN.md) を参照。

## 2. 経緯

| 段階 | 内容 |
| --- | --- |
| 計画 | Tauri 採用を決定 (Electron より軽量、リポジトリが Rust 前提だった) |
| v0.1.0 | エディタ + プレビュー + ファイル操作 + 3 OS の CI / リリースワークフロー |
| v0.2.0 | 複数タブ、ワークスペース、KaTeX / Mermaid、画像貼り付け、HTML / PDF 書き出し、アウトライン、設定、最近使ったファイル、自動アップデート、フォーカス / タイプライターモード、チートシート、表編集支援 |
| セルフレビュー | 自動レビューで 10 件の指摘、すべて修正 (下記) |
| リリース | GitHub Actions で 4 OS 分のドラフトリリースを生成 (v0.2.0) |

## 3. 環境構築でつまずいた点と対処

### macOS

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| `pnpm: command not found` | pnpm 未インストール | `brew install pnpm` または `npm i -g pnpm`。Node 26 以降は corepack が同梱されないので `corepack enable` は使えない |
| `cargo: command not found` (rustup 直後) | PATH が今のシェルに反映されていない | `source "$HOME/.cargo/env"` を実行するか、ターミナルを開き直す |
| `failed to run 'cargo metadata'` | 同上 | 同上 |

### Ubuntu (ヘッドレスサーバー)

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| `pnpm install` が `minimumReleaseAge cutoff` で失敗 | pnpm 12 の「公開直後のパッケージを拒否する」保護。Mermaid の依存 (d3 系) が公開から 24 時間未満だった | `pnpm install --config.minimum-release-age=0`。時間が経てば不要 |
| `tauri build` の最後に `A public key has been found, but no private key` | 自動アップデート用の署名鍵が無い。パッケージ自体は生成済み | v0.2.1 以降は既定で署名ファイルを作らないので発生しない。作る場合は `TAURI_SIGNING_PRIVATE_KEY` を設定して `pnpm tauri build --config src-tauri/tauri.updater.json` |
| `apt install ./xxx.deb` の最後に `Permission denied` の Notice | apt の `_apt` ユーザーがホーム配下の .deb を読めなかった | 警告のみ。インストールは完了している |
| アプリが起動できない | SSH 接続で画面が無い | モニタ付きのデスクトップで起動するか、`DISPLAY=:0 markdown-editor` のように画面を指定する |

Linux のビルドには次のパッケージが必要: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev libssl-dev build-essential`

## 4. リリース手順

1. `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` のバージョンを揃えて上げる
2. develop → main の PR をマージする
3. 次のどちらかでリリースワークフローを起動する
   - `git tag vX.Y.Z && git push origin vX.Y.Z`
   - GitHub の Actions タブ → Release → Run workflow でタグ名を入力 (main に release.yml がある必要あり)
4. 4 ジョブ (macOS Apple Silicon / macOS Intel / Linux / Windows) が完了するとドラフトリリースができる。内容を確認して Publish する。Publish するとタグも作られる

### 署名について

- **macOS**: Apple の署名用 Secrets (`APPLE_CERTIFICATE` など、README 参照) が無い場合はアドホック署名になる。初回起動時は右クリック →「開く」が必要
- **Windows**: 未署名。SmartScreen の警告が出る場合は「詳細情報」→「実行」
- **自動アップデート**: `TAURI_SIGNING_PRIVATE_KEY` を Secrets に登録したリリースから有効。公開鍵は `tauri.conf.json` に入っている。秘密鍵を紛失した場合は `pnpm tauri signer generate` で作り直し、公開鍵を貼り替える

## 5. セルフレビューで直した問題

| 重要度 | 問題 | 修正 |
| --- | --- | --- |
| 高 | macOS で ⌘Q が未保存確認を素通りして即終了 | 独自の Quit メニュー項目に置き換え、未保存確認を通す |
| 高 | 自動保存中に打った文字が「保存済み」扱いになり、閉じると失われる | 実際に書き込んだ内容を保存済みとして記録 |
| 高 | プレビューのリンクをクリックするとアプリ画面ごと遷移 | 外部 URL は既定ブラウザ、相対 .md はタブ、ページ内リンクはスクロール |
| 高 | macOS で起動時にダブルクリックしたファイルが開かれない | 起動時の受け取り口にも必ず積む |
| 中 | 複数ファイルを同時に開くと 1 つだけ開く / 重複タブ | 非同期処理後に状態を読み直す |
| 中 | 画像の貼り付けで大きな画像が固まる | JSON の数値配列ではなく生バイトで送信 |
| 中 | タブ切替後に折返し / タブ幅 / タイプライター設定が古いまま | 復元後に設定を再適用 |
| 中 | `100%.png` のような画像パスでプレビューが止まる | デコード失敗時は元のパスを使う |
| 低 | KaTeX のバージョンが描画側と CSS で食い違う | バージョンを揃え、書き出し HTML の CSS もそれに追従 |
| 低 | チートシートの Ctrl+/ がエディタのコメント切替と衝突 | F1 と Ctrl+Shift+/ に変更 |

報告のあった「`#` を消して付け直しても見出しに戻らない」件は再現せず、日本語入力モードの全角「＃」が原因と判断。行頭で全角「＃」「　」を入力した場合は半角に補正する処理を追加した。

## 6. 検証状況

- CI: macOS / Linux / Windows でビルド、vitest 23 件、rustfmt、clippy、cargo test 10 件 (ワークスペース全体)、Web サーバーのビルドが合格
- Linux (デスクトップ): 仮想ディスプレイ上で実際のアプリを操作し、ファイルを開く、タブ、サイドバー、アウトライン、数式、Mermaid、ローカル画像、表の Tab 移動、フォーカスモード、ダークテーマ、外部変更の再読込、リンク動作をスクリーンショットで確認
- Linux (Web モード): 自宅サーバー (Ubuntu) でビルドして起動し、Tailscale 経由で iPhone 実機の Safari から開けることを確認。iPhone 14 エミュレーターでは一連の操作 (ログイン、ファイル一覧、プレビュー、編集と保存、名前を付けて保存) を確認
- macOS: v0.1 は実機で起動確認済み。v0.2 以降の機能 (⌘W、画像貼り付け、印刷、⌘Q の確認) は未確認
- Windows: CI のみ

## 7. Web モード (v0.3.0)

「iPhone から自宅サーバー上のファイルを編集したい」という要望に応え、デスクトップ版はそのままに、同じ画面コードを HTTP サーバーから配信する入れ物を追加した。

- `crates/mde-core`: ファイル操作を Tauri 側と共有するクレート。`resolve_within` で公開フォルダ外へのアクセスを拒否
- `crates/mde-server`: axum 製の単一バイナリ。UI (dist) を rust-embed で同梱。トークン認証 (Cookie / Bearer)、`/api/{file,mtime,dir,image,raw,config}`
- `src/platform/`: UI からホスト機能を呼ぶ抽象層。Tauri 実装と Web 実装を切替
- `FilePicker`: OS ダイアログの代わりになるアプリ内ファイル選択 (開く / 名前を付けて保存)
- スマホ幅のレイアウト: 下部バー (フォルダ、アウトライン、表示切替、保存、メニュー)、サイドバーはオーバーレイ、分割表示は上下、PWA 用メタ情報とアイコン
- 検証: iPhone 14 をエミュレートした Playwright で、ログイン、ファイル一覧、プレビュー (数式 / Mermaid / 画像)、編集と保存、名前を付けて保存、未認証時のログイン画面を確認

## 7b. 編集機能の追加 (v0.3.0)

- リスト・引用の継続 (既定: Shift+Enter。設定で Enter 継続 / オフ)。番号付きリストは自動採番、空の項目で解除
- WYSIWYG 風表示 (既定オフ): カーソル行以外で見出し記号、強調、インラインコード、リンクの記号を非表示にする CodeMirror の装飾
- スマートペースト (既定: 毎回確認): 選択範囲に URL を貼ると `[選択](URL)` に。設定で常に / 確認 / オフ
- ワークスペース全文検索: `mde_core::search` (大文字小文字を区別しない部分一致、隠しフォルダと node_modules / target / dist を除外、2MB 超のファイルは対象外、500 件で打ち切り)。Tauri コマンドと `/api/search` の両方から利用。サイドバーの検索欄、Ctrl/⌘+Shift+F。フォーカスモードは Ctrl/⌘+Shift+D に移動

## 8. 残っている作業・候補

- macOS / Windows の実機で v0.2 を確認する
- Apple の署名と公証、アップデータ署名鍵の Secrets 登録
- 表編集は `| a | b |` 形式 (先頭と末尾にパイプがある表) のみ対応
- Web モードの実機 (iPhone Safari) での確認。IME 入力と「ホーム画面に追加」の動作
- Web モードの HTTPS 化 (リバースプロキシ) と、複数の公開フォルダ対応
- 候補機能: WYSIWYG 的なインライン表示、Git 連携、プラグイン / カスタム CSS、i18n (英語 UI)

## 9. 運用メモ (次にやることのチェックリスト)

### おうちサーバー (Ubuntu) で Web モードを動かす

```bash
cd ~/dev/mark-down-editor && git checkout main && git pull origin main
source "$HOME/.cargo/env"
pnpm install --config.minimum-release-age=0   # pnpm 12 の公開日制限を回避
pnpm server:build                             # target/release/markdown-editor-server ができる
./target/release/markdown-editor-server --root ~/notes --port 36660
```

- 起動時に表示される `?token=...` 付き URL を `http://100.116.164.1:36660/?token=...` (Tailscale のアドレス) に読み替えて iPhone の Safari で開く
- 一度開けばトークンは Cookie に保存される。Safari の共有メニュー →「ホーム画面に追加」で全画面起動
- 常駐化: `sudo ./deploy/install-service.sh --root ~/notes` (ポート 36660、トークンは `/etc/markdown-editor.env` に固定保存)。今のトークンを引き継ぐなら `--token` で渡す
- 更新するとき: `git pull origin main && pnpm install --config.minimum-release-age=0 && pnpm server:build && sudo ./deploy/install-service.sh --root ~/notes` (トークンは保持される)
- 状態確認: `systemctl status markdown-editor`、ログ: `journalctl -u markdown-editor -f`

### Mac で最新を動かす

```bash
cd ~/dev/mark-down-editor && git checkout main && git pull origin main
pnpm install && pnpm tauri dev      # 開発モード
pnpm tauri build                    # .app / .dmg を作る (src-tauri/target/release/bundle/)
```

### v0.3.0 をリリースする

1. GitHub の Actions タブ → Release → Run workflow → tag に `v0.3.0` を入力 (または `git tag v0.3.0 && git push origin v0.3.0`)
2. 4 OS 分のインストーラと `markdown-editor-server-linux-x86_64` 付きのドラフトリリースができる
3. ブラウザ (スマホアプリ不可) で Releases → 鉛筆アイコン → Publish release

### GitHub Secrets に登録すると有効になるもの

| Secret | 効果 | 状態 |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | 自動アップデート用の署名。秘密鍵はこのセッションの作業フォルダにしか無いので、紛失していれば `pnpm tauri signer generate` で作り直し、`src-tauri/tauri.conf.json` の `pubkey` を貼り替える | 未登録 |
| `APPLE_CERTIFICATE` ほか (README 参照) | macOS の署名と公証。無い間はアドホック署名 (初回は右クリック → 開く) | 未登録 |

### まだ実機で確認していないこと

- iPhone 実機の Safari (開けることは確認済み): 日本語 IME での入力、ホーム画面追加後の全画面表示、画像の貼り付け
- macOS 実機の v0.2 以降: ⌘W でタブが閉じる、画像の貼り付け、⌘P の印刷、⌘Q の未保存確認
- Windows 実機: 起動と `.md` の関連付け

### 困ったとき

- `pnpm` が見つからない (Mac): `brew install pnpm`。Node 26 以降は corepack が無い
- `cargo` が見つからない: `source "$HOME/.cargo/env"`
- `minimumReleaseAge cutoff` で pnpm install が失敗: `--config.minimum-release-age=0` を付ける
- Web モードで 401 になる: Cookie が消えている。`?token=...` 付き URL を開き直す
- Web モードで画像が出ない: 画像が `--root` の外にある。フォルダ内に置く
- develop ブランチは PR マージ時に GitHub 側で削除される設定。次の作業は `git checkout -B develop origin/main` で作り直す
