# C# 移行（Site Builder → C# + Avalonia）

Electron 版 Site Builder を **C# + Avalonia（Native AOT + SkiaSharp）** へ移行するための作業ディレクトリです。

## なぜ C# + Avalonia か

要件は **①配布サイズ削減 / 起動高速化** と **③完全ネイティブUI化** の両立でした。

- **③ ネイティブUI**: Avalonia は Skia で直接描画する真のネイティブ UI。WPF と違いクロスプラットフォーム（Windows / macOS / Linux）。
- **① 小サイズ**: Native AOT で自己完結バイナリが 15〜40MB 程度（Electron の数百MB → 桁違い）。Chromium 非同梱で起動も高速。
- **描画の再現性**: 本アプリの肝であるリッチな CSS 効果（多層 box-shadow、グラデ文字 `background-clip:text`、`-webkit-text-stroke`、グロー/ベベル）は、Skia の `SKShader` / `SKMaskFilter.Blur` / `SKPaint.Stroke` で 1:1 に再現できる。

ハイブリッド（Tauri / WebView2）は ① には最適だが webview を残すため ③ と両立しないので不採用。

## 移行フェーズ

| フェーズ | 内容 | 状態 |
|---|---|---|
| **1. 出力エンジン移植** | `css-generator.js` → `CssGenerator.cs`（純ロジック）＋テスト | ✅ 本コミット（`CssGenerator` 完了） |
| 1b. | `renderer.js`（HTML/Blade 生成 470行）→ `HtmlRenderer.cs` | ⬜ 次 |
| 1c. | `exporter.js`（プロジェクト組み立て 250行）→ `ProjectExporter.cs` | ⬜ |
| 2. シェル | Avalonia アプリ雛形＋空キャンバス＋ファイル保存/読込（`main.js` 相当） | ⬜ |
| 3. 描画 | 要素モデル → Skia 描画（矩形/テキスト → 影・グラデ等のエフェクト） | ⬜ |
| 4. 編集UI | インスペクタ / レイヤー / 履歴(Undo) | ⬜ |

出力エンジン（フェーズ1）を先に固めることで、「エディタは未完成でも既存 Electron 版と同一の HTML/Blade が出る」ことを早期に保証できる。

## 構成

```
csharp/
├── SiteBuilder.sln
├── SiteBuilder.Core/            出力エンジン（UI非依存・AOT互換）
│   ├── Models.cs                要素プロパティのデータモデル
│   └── CssGenerator.cs          css-generator.js の忠実移植
└── SiteBuilder.Core.Tests/      xUnit テスト（JS 挙動を固定）
    └── CssGeneratorTests.cs
```

## ビルド / テスト（要 .NET 8 SDK）

```bash
cd csharp
dotnet test          # Core のテストを実行
dotnet build -c Release
```

> 注: このリポジトリを生成した環境には .NET SDK が入っていないため、`dotnet test` は手元で実行してください。
> 期待値は JS 版のロジックから逐次導出しており、両実装の一致を検証する回帰テストになっています。

## 移植の難易度マップ（既存コード基準）

| 部分 | 元ファイル | 難易度 | 備考 |
|---|---|---|---|
| 出力エンジン | `export/{renderer,css-generator,exporter}.js`（純ロジック 約1,700行） | 易 | 文字列生成のみ。ほぼ機械的に移植可 |
| ファイルIPC | `main/main.js`（218行） | 易 | `System.IO` に置換 |
| データモデル | `nodes/*.js` | 中 | C# のクラス/レコードに再設計 |
| エディタ描画 | `canvas/*` `inspector/*` `interaction/*` | 難 | DOM 前提を Skia 描画へ全面再実装（工数の大半） |
