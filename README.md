# Markdown Editor

macOS / Linux / Windows で動く、単独で動作する Markdown エディタです。
[Tauri 2](https://tauri.app) (Rust) + React + CodeMirror 6 で作られています。

## 機能 (v0.1)

- ファイルの新規作成 / 開く / 保存 / 名前を付けて保存
- Markdown シンタックスハイライト付きエディタ (行番号、折返し、検索・置換、Undo/Redo)
- GFM 対応のライブプレビュー (表、タスクリスト、取り消し線、コードハイライト)
- エディタとプレビューのスクロール同期
- 表示モード: 編集のみ / 分割 / プレビューのみ
- ライト / ダークテーマ (OS 設定に追従)
- 未保存の変更がある状態での終了確認
- 他のプログラムによるファイル変更の検知と再読込
- `.md` / `.markdown` ファイルの関連付け

### ショートカット

| 操作 | macOS | Windows / Linux |
| --- | --- | --- |
| 新規 | ⌘N | Ctrl+N |
| 開く | ⌘O | Ctrl+O |
| 保存 | ⌘S | Ctrl+S |
| 名前を付けて保存 | ⌘⇧S | Ctrl+Shift+S |
| 検索 / 置換 | ⌘F | Ctrl+F |
| 太字 / 斜体 / コード | ⌘B / ⌘I / ⌘E | Ctrl+B / Ctrl+I / Ctrl+E |
| リンク挿入 | ⌘K | Ctrl+K |
| 見出し 1 / 2 / 3 | ⌘1 / ⌘2 / ⌘3 | Ctrl+1 / Ctrl+2 / Ctrl+3 |
| 編集 / 分割 / プレビュー表示 | ⌘⇧1 / ⌘⇧2 / ⌘⇧3 | Ctrl+Shift+1 / 2 / 3 |

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

Windows の署名は任意です。必要になった場合は Tauri のドキュメント (https://tauri.app/distribute/sign/windows/) に従って `tauri.conf.json` の `bundle.windows` に設定を追加してください。

## 構成

```
src/                 フロントエンド (React + TypeScript)
  editor/            CodeMirror 6 のラッパー、テーマ、書式コマンド
  preview/           unified (remark/rehype) による Markdown 変換、スクロール同期
  features/files/    ファイル操作 (Tauri コマンド呼び出し、ダイアログ)
  components/        ツールバー、ステータスバー
  store/             アプリ状態 (zustand)
src-tauri/           Rust バックエンド (ファイル読み書き、設定)
docs/PLAN.md         開発計画
```
