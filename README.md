# Markdown Editor

macOS / Linux / Windows で動く、単独で動作する Markdown エディタです。
[Tauri 2](https://tauri.app) (Rust) + React + CodeMirror 6 で作られています。

## 機能

- ファイルの新規作成 / 開く / 保存 / 名前を付けて保存、複数タブ、最近使ったファイル、前回開いていたファイルの復元
- フォルダをワークスペースとして開き、サイドバーのファイルツリーから開く
- Markdown シンタックスハイライト付きエディタ (行番号、折返し、検索・置換、Undo/Redo)
- GFM 対応のライブプレビュー (表、タスクリスト、脚注、取り消し線、コードハイライト)
- 数式 (KaTeX: `$...$`, `$$...$$`) と Mermaid 図 (```` ```mermaid ````)、すべてオフラインで動作
- 画像の貼り付け / ドラッグ&ドロップ: 文書と同じ場所の `assets/` に保存して相対パスで挿入。ローカル画像をプレビューに表示
- 表の編集支援: 挿入ダイアログ、Tab / Shift+Tab でセル移動 (最終セルで Tab すると行追加)、列幅の自動整形 (全角文字対応)、行・列の追加削除、配置切替
- アウトライン (見出し一覧からジャンプ)
- HTML 書き出し (単独で開ける HTML)、印刷 / PDF (OS の印刷ダイアログ)
- 表示モード: 編集のみ / 分割 / プレビューのみ、フォーカスモード、タイプライターモード
- 設定: テーマ (OS 追従 / ライト / ダーク)、フォント、文字サイズ、タブ幅、折返し、自動保存
- チートシート (Markdown 記法とショートカットの一覧、F1)
- 未保存の変更がある状態での終了確認、他のプログラムによるファイル変更の検知と再読込
- 自動アップデート (GitHub Releases から更新を確認。署名鍵の設定が必要、下記参照)
- `.md` / `.markdown` ファイルの関連付け
- 日本語 IME で行頭に入力した全角「＃」「　」は半角に補正 (見出し記号として扱えるように)

### ショートカット

| 操作 | macOS | Windows / Linux |
| --- | --- | --- |
| 新規タブ | ⌘N | Ctrl+N |
| 開く | ⌘O | Ctrl+O |
| 保存 / 名前を付けて保存 | ⌘S / ⌘⇧S | Ctrl+S / Ctrl+Shift+S |
| タブを閉じる | ⌘W | Ctrl+W |
| 次 / 前のタブ | Ctrl+Tab / Ctrl+Shift+Tab | Ctrl+Tab / Ctrl+Shift+Tab |
| 検索 / 置換 | ⌘F | Ctrl+F |
| 太字 / 斜体 / コード | ⌘B / ⌘I / ⌘E | Ctrl+B / Ctrl+I / Ctrl+E |
| リンク挿入 | ⌘K | Ctrl+K |
| 見出し 1 / 2 / 3 | ⌘1 / ⌘2 / ⌘3 | Ctrl+1 / Ctrl+2 / Ctrl+3 |
| 編集 / 分割 / プレビュー表示 | ⌘⇧1 / ⌘⇧2 / ⌘⇧3 | Ctrl+Shift+1 / 2 / 3 |
| サイドバー / アウトライン | ⌘⇧E / ⌘⇧O | Ctrl+Shift+E / Ctrl+Shift+O |
| フォーカス / タイプライターモード | ⌘⇧F / ⌘⇧T | Ctrl+Shift+F / Ctrl+Shift+T |
| HTML 書き出し / 印刷 (PDF) | ⌘⇧H / ⌘P | Ctrl+Shift+H / Ctrl+P |
| 設定 | ⌘, | Ctrl+, |
| チートシート | F1 または ⌘⇧/ | F1 または Ctrl+Shift+/ |
| 表の中でセル移動 | Tab / ⇧Tab | Tab / Shift+Tab |

## 開発

### 必要なもの

- Node.js 22+ と pnpm
- Rust (stable) — https://rustup.rs
- OS 別の依存関係: https://tauri.app/start/prerequisites/
  - Linux (Ubuntu/Debian): `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev libssl-dev build-essential`
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools (C++)、WebView2 ランタイム

### コマンド

```bash
pnpm install
pnpm tauri dev      # 開発モードで起動
pnpm tauri build    # 配布用パッケージを作成 (src-tauri/target/release/bundle/)
pnpm build          # フロントエンドのみビルド (型チェック含む)
pnpm test           # フロントエンドのユニットテスト (vitest)
cargo test --manifest-path src-tauri/Cargo.toml
```

## リリース

`v*` タグを push すると GitHub Actions が macOS (Apple Silicon / Intel)、Linux (AppImage / deb / rpm)、Windows (msi / exe) のパッケージをビルドし、ドラフトリリースに添付します。

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub の Actions タブから「Release」ワークフローを手動実行 (Run workflow) し、タグ名を入力して起動することもできます。手動実行は release.yml がデフォルトブランチ (main) に含まれている必要があります。

### コード署名

署名用の Secrets が設定されていない場合は未署名でビルドされます。その場合、macOS では初回起動時に Gatekeeper の警告が出るため、アプリを右クリック →「開く」で起動してください。Windows では SmartScreen の警告が出る場合があります（「詳細情報」→「実行」）。

macOS で署名・公証するには、Apple Developer Program に加入し、リポジトリの Secrets に次を登録します。

| Secret | 内容 |
| --- | --- |
| `APPLE_CERTIFICATE` | Developer ID Application 証明書 (.p12) を base64 化した文字列 |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 のパスワード |
| `KEYCHAIN_PASSWORD` | CI 用キーチェーンの任意のパスワード |
| `APPLE_SIGNING_IDENTITY` | 例: `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | 公証用の Apple ID、App 用パスワード、Team ID |

### 自動アップデート

アプリは起動時に GitHub Releases の `latest.json` を確認します (設定でオフにできます)。更新パッケージは minisign 鍵で署名されている必要があり、対応する公開鍵は `src-tauri/tauri.conf.json` の `plugins.updater.pubkey` に入っています。リポジトリの Secrets に `TAURI_SIGNING_PRIVATE_KEY` (秘密鍵の内容) と、パスワード付きの場合は `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` を登録すると、リリース時に署名済みの更新パッケージと `latest.json` が生成されます。未設定の場合は通常のインストーラだけが作られ、自動更新は動きません (鍵を作り直す場合は `pnpm tauri signer generate` で生成し、公開鍵を設定に貼り替えてください)。

Windows の署名は任意です。必要になった場合は Tauri のドキュメント (https://tauri.app/distribute/sign/windows/) に従って `tauri.conf.json` の `bundle.windows` に設定を追加してください。

## 構成

```
src/                 フロントエンド (React + TypeScript)
  editor/            CodeMirror 6 のラッパー、テーマ、書式コマンド、表編集、画像挿入
  preview/           unified (remark/rehype) による Markdown 変換、KaTeX / Mermaid、スクロール同期
  features/          ファイル操作、書き出し、アップデータ
  components/        ツールバー、タブ、サイドバー、アウトライン、設定、チートシート
  store/             アプリ状態と設定 (zustand、tauri-plugin-store)
  __tests__/         ユニットテスト (vitest)
src-tauri/           Rust バックエンド (ファイル読み書き、ディレクトリ一覧、画像保存、メニュー)
docs/PLAN.md         開発計画
```
