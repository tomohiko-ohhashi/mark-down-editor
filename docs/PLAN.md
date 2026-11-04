# Markdown Editor デスクトップアプリ 開発計画

対象 OS: macOS / Linux / Windows

## 1. 方針と技術選定

| 項目 | 選定 | 理由 |
| --- | --- | --- |
| アプリ基盤 | **Tauri 2** | Rust バックエンド + Web フロント。配布物が小さく（数 MB〜）、メモリも軽い。3 OS 向けインストーラを公式 CI アクションで一括生成できる。リポジトリの .gitignore が Cargo 前提になっており方針と一致する |
| フロント | **TypeScript + React + Vite** | Tauri 公式テンプレートがあり情報量が多い |
| エディタ | **CodeMirror 6** | 軽量・拡張性が高い。Markdown 言語モード、キーマップ、折返し、Vim キーバインド拡張などが揃っている |
| Markdown 変換 | **unified (remark / rehype)** | GFM、数式 (KaTeX)、シンタックスハイライト (shiki or highlight.js)、Mermaid などをプラグインで追加できる |
| 状態管理 | Zustand | 小規模で十分 |
| テスト | Vitest (フロント) / cargo test (Rust) / Playwright or WebdriverIO + tauri-driver (E2E) | |
| パッケージング | tauri-apps/tauri-action (GitHub Actions) | .dmg / .msi / .exe (NSIS) / .AppImage / .deb / .rpm |

### Electron を選ばない理由
- 配布サイズ 100MB 超、メモリ消費が大きい
- 本リポジトリは Rust 前提で初期化済み

### 注意点 (Tauri の制約)
- WebView が OS 依存 (macOS: WKWebView、Windows: WebView2、Linux: WebKitGTK)。CSS/JS の差分を CI で 3 OS 実機確認する
- Linux は WebKitGTK 4.1 系の開発パッケージが必要 (`libwebkit2gtk-4.1-dev` など)
- Windows は WebView2 ランタイム (Win10 以降は標準同梱、インストーラにブートストラッパ同梱可)

## 2. 機能スコープ

### MVP (v0.1)
- ファイル操作: 新規 / 開く / 保存 / 名前を付けて保存 / 最近使ったファイル
- エディタ: Markdown シンタックスハイライト、行番号、折返し、Tab/インデント、Undo/Redo、検索・置換
- プレビュー: GFM 対応のライブプレビュー、エディタとスクロール同期
- 表示モード: エディタのみ / 分割 / プレビューのみ
- 外部からの変更検知と再読込確認、未保存の終了確認
- ライト / ダークテーマ (OS 追従)
- ショートカット: Cmd/Ctrl+S, O, N, F, B(太字), I(斜体) など
- 日本語入力 (IME) の正常動作確認

### v0.2
- 複数タブ / 複数ウィンドウ
- フォルダをワークスペースとして開く (ファイルツリー)
- 画像のドラッグ&ドロップ / ペースト → 相対パスで保存して挿入
- HTML / PDF エクスポート
- 目次 (アウトライン) パネル
- 設定画面 (フォント、タブ幅、テーマ、自動保存)

### v0.3 以降 (候補)
- 数式 (KaTeX)、Mermaid、脚注、タスクリスト
- WYSIWYG 的なインライン表示モード
- 自動アップデート (tauri-plugin-updater)
- プラグイン / カスタム CSS
- Git 連携 (差分表示)

## 3. アーキテクチャ

```
src/                     # フロント (React + TS)
  app/                   # ルート、レイアウト、テーマ
  editor/                # CodeMirror ラッパー、拡張、キーマップ
  preview/               # unified パイプライン、スクロール同期
  features/
    files/               # 開く/保存/最近使ったファイル (Tauri コマンド呼び出し)
    settings/
  store/                 # Zustand
src-tauri/               # Rust
  src/
    main.rs
    commands/            # fs 操作、ダイアログ、watch、設定の読み書き
    state.rs
  tauri.conf.json
  capabilities/          # 権限 (fs, dialog, shell 等) を最小限に
.github/workflows/
  ci.yml                 # lint / test (3 OS matrix)
  release.yml            # tag push で tauri-action による配布物生成
docs/
```

- フロントから Rust へは `invoke()` 経由のコマンドのみ。ファイル I/O、ファイル監視 (notify crate)、設定保存は Rust 側で担当
- 公式プラグインを利用: `tauri-plugin-dialog`, `tauri-plugin-fs`, `tauri-plugin-store` (設定), `tauri-plugin-window-state`, `tauri-plugin-updater` (後続)
- プレビューは `rehype-sanitize` を通し、CSP を tauri.conf.json で有効にする

## 4. マイルストーン

| # | 内容 | 目安 |
| --- | --- | --- |
| M0 | 環境構築: `create-tauri-app` で雛形生成、ESLint/Prettier/rustfmt/clippy、CI (3 OS で build + test) | 1 週 |
| M1 | エディタ + プレビュー + ファイル開閉保存 (MVP の中核) | 2 週 |
| M2 | 検索置換、表示モード、テーマ、ショートカット、未保存確認、外部変更検知 | 1〜2 週 |
| M3 | パッケージング: アイコン、アプリ名、ファイル関連付け (.md)、release.yml、3 OS で動作確認 → **v0.1 リリース** | 1 週 |
| M4 | タブ / ワークスペース / 画像貼付 / エクスポート → v0.2 | 3〜4 週 |
| M5 | 数式・Mermaid・自動アップデート → v0.3 | 継続 |

## 5. 配布とリリース手順

1. `git tag vX.Y.Z` → `release.yml` が 3 OS で `tauri build` を実行し GitHub Release にドラフトとして添付
2. 署名
   - macOS: Developer ID 証明書 + notarization (未署名だと Gatekeeper 警告)。当面は未署名 + README に回避手順を記載
   - Windows: コード署名証明書は任意。未署名だと SmartScreen 警告
   - Linux: AppImage / deb / rpm。将来 Flatpak も検討
3. 自動アップデートを入れる場合は updater 用の鍵ペアを GitHub Secrets に登録

## 6. 開発環境の前提

- Node.js 20+ / pnpm
- Rust stable (rustup)
- macOS: Xcode Command Line Tools
- Windows: Visual Studio Build Tools (C++)、WebView2
- Linux: `libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev`

## 7. 決めておくべき事項

- アプリ名 / バンドル ID (例: `dev.example.markdowneditor`)
- ライセンス
- 最低サポート OS (macOS 11+, Windows 10+, Ubuntu 22.04+ を想定)
- 設定の保存場所 (Tauri の app config dir を使用)
- i18n を初期から入れるか (日本語 / 英語)

## 8. 進捗

- [x] M0 環境構築 (Tauri 2 + React/TS 雛形、3 OS CI、release ワークフロー)
- [x] M1 エディタ + プレビュー + ファイル開閉保存
- [x] M2 検索置換、表示モード、テーマ、ショートカット、未保存確認、外部変更検知
- [x] M3 アイコン差し替え、3 OS で CI 合格、Linux で配布パッケージ生成を確認
- [x] M3 v0.1.0 タグ push。mac 実機で起動確認。Windows は CI のみ
- [x] M4 複数タブ、ワークスペース、画像貼付、HTML/PDF 書き出し、アウトライン、設定、最近使ったファイル
- [x] M5 KaTeX、Mermaid、自動アップデート (署名鍵の Secrets 登録が必要)、フォーカス / タイプライターモード、チートシート、表編集支援
- [x] v0.2.0 リリース (4 OS)
- [x] v0.3.0 Web モード (HTTP サーバー + スマホ向けレイアウト)
- [x] iPhone 実機から Web モードで接続できることを確認 (自宅サーバー + Tailscale)
- [ ] 次: mac / Windows 実機での再確認、iPhone での日本語入力と画像貼り付けの確認

## 9. 最初の一歩 (M0 の具体タスク、参考)

```bash
pnpm create tauri-app@latest . --template react-ts --manager pnpm
pnpm add @codemirror/state @codemirror/view @codemirror/lang-markdown @codemirror/commands @codemirror/search
pnpm add unified remark-parse remark-gfm remark-rehype rehype-sanitize rehype-stringify
pnpm add @tauri-apps/plugin-dialog @tauri-apps/plugin-fs @tauri-apps/plugin-store
pnpm tauri dev
```

- `.github/workflows/ci.yml` を追加し、ubuntu / macos / windows の matrix で `pnpm build` と `cargo test` を回す
- `src-tauri/tauri.conf.json` に `productName`, `identifier`, `bundle.targets = "all"` を設定
