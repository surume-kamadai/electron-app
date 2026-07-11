# Site Builder 移行計画：Electron → C# + Avalonia

## 0. 前提と目的

現行アプリは Electron 製の GUI サイトビルダー（DOM ベースの WYSIWYG エディタ ＋ HTML / CSS / Laravel Blade 出力、JS 約 8,000 行）。

移行の目的（確定）:

- **① 配布サイズ削減 / 起動高速化** … Chromium 同梱をやめたい
- **③ 完全ネイティブ UI 化** … Web 技術を捨ててネイティブ UI にしたい

## 1. 技術選定

**採用: C# + Avalonia（Native AOT + SkiaSharp）**

| 観点 | 理由 |
|---|---|
| ③ ネイティブUI | Avalonia は Skia で直接描画する真のネイティブ UI。クロスプラットフォーム（Win/Mac/Linux） |
| ① 小サイズ | Native AOT で自己完結バイナリ 15〜40MB 程度、Chromium 非同梱で起動高速 |
| 描画再現性 | 多層 box-shadow / グラデ文字 / 縁取り / グロー / ベベルを Skia の `SKShader`・`SKMaskFilter.Blur`・`SKPaint.Stroke` で 1:1 再現可能 |

**不採用:**
- Tauri / C# + WebView2（ハイブリッド）… ① には最適だが webview を残すため ③ と両立しない
- C++ + Qt … 描画力は同等だがバイナリ大・ライセンス注意・開発速度で劣る
- Rust + Slint/egui … 最小バイナリだがこの規模のエディタにはエコシステムが未成熟

## 2. アーキテクチャ方針

```
SiteBuilder.Core        出力エンジン（UI非依存・AOT互換）… JSの export/* を移植
SiteBuilder.App         Avalonia アプリ（シェル・キャンバス・インスペクタ）
SiteBuilder.Rendering   Skia 描画（要素モデル → 画面描画。CSS効果の再現）
SiteBuilder.Core.Tests  出力エンジンの回帰テスト（JS挙動を固定）
```

**設計原則: 出力エンジンと描画エンジンを分離する。**
「出力される HTML」と「画面に見えるプレビュー」は別実装になる（前者は文字列生成、後者は Skia 描画）。両者が視覚的に一致することが WYSIWYG の肝なので、共通のプロパティモデル（`ElementProps` 等）を単一ソースにして双方が参照する。

## 3. フェーズ計画

| フェーズ | 内容 | 主な元ファイル | 難易度 | 完了条件 |
|---|---|---|---|---|
| **1a** | 出力ヘルパー移植 | `export/css-generator.js` | 易 | テスト緑 |
| **1b** | HTML/Blade 生成 | `export/renderer.js`（470行） | 中 | 既存 `renderer.test.js` 相当が緑 |
| **1c** | プロジェクト組み立て | `export/exporter.js`（250行） | 中 | 既存 `exporter.test.js` 相当が緑、実ファイル出力一致 |
| **2** | シェル雛形 | `main/main.js`（218行）, `index.html` | 中 | Avalonia 窓が開き、保存/読込が動く |
| **3** | データモデル | `nodes/*.js` | 中 | プロジェクト JSON を読み書きできる |
| **4** | 描画エンジン | `canvas/*` | 難 | 矩形/テキスト → 影・グラデ・縁取り・ベベルを描画 |
| **5** | 編集 UI | `inspector/*`, `interaction/*`, `history/*` | 難 | 選択・移動・プロパティ編集・Undo/Redo |
| **6** | 仕上げ | `ui/*`, `explorer/*`, `preview/*` | 中 | 複数ページ・設定・プレビュー |
| **7** | 配布 | — | 中 | AOT ビルド、Win/Mac インストーラ |

**進め方の要点:** フェーズ1（出力エンジン）を最初に固めると、エディタ未完成でも「既存 Electron 版と同一の HTML/Blade が出る」ことを保証でき、以降の描画実装の答え合わせに使える。

## 4. 移植の難所（リスク）

1. **CSS 効果の Skia 再現（最大の山）**
   `-webkit-text-stroke`、`background-clip:text`（グラデ文字）、多層 `box-shadow`、ベベルは素のコントロールでは出ない。Skia の低レベル描画で 1 つずつ実装が必要。工数の大半。
2. **テキストレイアウトの差異**
   ブラウザの折り返し・行間・フォントメトリクスと Skia/HarfBuzz の結果を一致させる調整。
3. **Google Fonts**
   エディタ内表示用にフォント埋め込みが必要（出力 HTML 側は従来どおり `<link>`）。
4. **画像の扱い**
   現行は `data:` URI ベース。ネイティブ側ではファイル参照＋出力時コピーへ設計変更。
5. **Undo/Redo・クリップボード**
   DOM 前提の実装をモデルベースへ再設計。

## 5. マイルストーン（目安）

- **M1**: 出力エンジン移植完了（フェーズ1）… 既存テスト全緑、CLI で HTML 出力が一致
- **M2**: 最小エディタ（フェーズ2〜4）… 矩形/テキストを置いて動かし出力できる
- **M3**: 機能パリティ（フェーズ5〜6）… 現行 Electron 版と同等の編集体験
- **M4**: 配布（フェーズ7）… AOT ビルド済みインストーラ

## 6. 検証方針

- 出力エンジンは **既存 JS テスト（`*.test.js`）を移植した回帰テスト**で JS ↔ C# の出力一致を保証
- 描画は **同一プロジェクトを Electron 版と新版で開いた画面比較**（スクリーンショット差分）で確認
