# Site Builder C# 移行計画書

Electron + JavaScript 製の Site Builder を C# (.NET) へ移行するための具体的な計画書です。
現行コードの棚卸し → 技術選定 → データモデル定義 → モジュール対応表 → 段階的な移行フェーズ →
出力互換の保証方法、の順に示します。

---

## 1. 現状分析（移行対象の棚卸し）

### 1.1 アプリの正体

リポジトリ名に「Laravel」と付いていますが、**PHPコードは含まれていません**。
実体は以下の構成の **Electron デスクトップアプリ** です。

- **Electron メインプロセス** (`src/main/`): ウィンドウ生成、ネイティブメニュー、
  ファイルダイアログ、プロジェクト書き出しの IPC 受け口（約300行）
- **レンダラー** (`src/renderer/`): Konva ベースのキャンバスエディタ、
  ドッキングパネル UI、HTML/Laravel Blade 生成エンジン（約7,600行）
- 自作コード合計: **約7,900行**（vendor 同梱ライブラリを除く）

### 1.2 モジュール別の規模と責務

| モジュール | 行数 | 責務 | 移行難易度 |
|---|---:|---|---|
| `main/main.js` + `preload.js` | 298 | ウィンドウ・メニュー・ダイアログ・ファイルI/O (IPC) | ★ 低 |
| `export/renderer.js` | 545 | シーンJSON → HTML/Blade 文字列生成エンジン | ★ 低（純ロジック） |
| `export/exporter.js` | 302 | 静的サイト / Laravel プロジェクト一式の組み立て | ★ 低（純ロジック） |
| `export/css-generator.js` | 191 | CSS生成の純粋ヘルパー（副作用なし） | ★ 低 |
| `export/render-components.js` | 290 | Slider / ArticleGrid / Accordion のHTML生成 | ★ 低 |
| `nodes/elements.js` | 501 | 要素の生成・グループ化・採番 | ★★ 中 |
| `nodes/converter.js` | 134 | Konvaノード ⇄ シーンJSON 変換 | ★★ 中 |
| `nodes/node-style.js` | 236 | 影・グラデーション・枠線などのKonva反映 | ★★ 中 |
| `nodes/components.js` | 124 | テンプレ部品（Hero/Card/FAQ等）の定義 | ★ 低（データ定義） |
| `nodes/warp.js` | 154 | テキストワープ変形 | ★★★ 高 |
| `canvas/*`（7ファイル） | 1,015 | ステージ表示・定規・ズーム・プレビュー・エフェクト | ★★★ 高 |
| `interaction/*`（4ファイル） | 809 | ドラッグ・リサイズ・スナップ・テキスト直接編集・クリップボード | ★★★ 高 |
| `inspector/*`（7ファイル） | 1,393 | プロパティパネル（色・スライダー・アコーディオン編集） | ★★ 中 |
| `explorer/` + `project/` + `ui/` | 1,045 | レイヤー一覧・ページ/フォルダ管理・ドックレイアウト・トースト | ★★ 中 |
| `history/history.js` | 80 | Undo（シーン全体のスナップショット方式） | ★ 低 |
| `app/state.js` + `main-renderer.js` | 229 | 共有ステート・起動時の配線 | ★ 低 |
| テスト（vitest） | 273 | exporter / renderer の単体テスト | ★ 低（移植必須） |

### 1.3 外部依存ライブラリと C# 代替

| 現行 (JS) | 用途 | C# 代替 |
|---|---|---|
| Konva 9.x | 2Dキャンバス・シーングラフ・変形ハンドル | **SkiaSharp + 自作シーングラフ**（§6参照） |
| GoldenLayout 1.5 | ドッキングパネル | **Dock.Avalonia**（NuGet: `Dock.Avalonia`） |
| @simonwep/pickr | カラーピッカー | Avalonia 標準の `ColorPicker`（`Avalonia.Controls.ColorPicker`） |
| jQuery | DOM操作 | 不要（XAML + データバインディングで代替） |
| Electron / electron-builder | シェル・配布 | .NET ランタイム + **Velopack**（Win）/ dmg 生成（Mac） |
| vitest | テスト | **xUnit**（+ `Verify` スナップショットテスト） |

### 1.4 データフロー（これが移行の背骨）

```
[編集]  Konvaノードツリー ⇄ (converter.js) ⇄ シーンJSON (project.json)
[出力]  シーンJSON → exporter.js → HtmlRenderer → 静的HTML一式 / Laravelプロジェクト一式
[保存]  シーンJSON → main.js IPC → ディスク
```

**シーンJSON（project.json）がアプリの中心データであり、この互換性を保てば
既存ユーザーのプロジェクトはそのまま C# 版で開けます。** 移行の絶対条件とします。

---

## 2. 技術選定

### 2.1 UIフレームワークの比較

現行は `build:win`（NSIS）と `build:mac`（dmg）の**両OS対応**なので、これを維持できるかが軸です。

| 候補 | Win | Mac | キャンバス描画 | 評価 |
|---|:-:|:-:|---|---|
| **Avalonia UI 11**（推奨） | ○ | ○ | 内部が Skia。カスタム描画・ヒットテストが素直に書ける | ◎ 唯一 Win/Mac 両対応の成熟デスクトップXAML |
| WPF | ○ | × | DrawingVisual等で可能 | △ Mac対応を捨てることになる |
| WinUI 3 | ○ | × | Win2D | △ 同上 |
| .NET MAUI | ○ | ○ | GraphicsView | △ デスクトップのメニュー/ドッキング等が弱い |
| Blazor Hybrid | ○ | ○ | Konvaをそのまま流用 | ○ ただしUI層はJSのまま＝「C#移行」にならない（§10の代替案） |

**結論: .NET 8 LTS + Avalonia UI 11 + SkiaSharp を採用します。**

- Avalonia は XAML/MVVM で WPF 経験者がそのまま書け、描画基盤が Skia なので
  Konva 相当のカスタムキャンバスとの相性が良い。
- Dock.Avalonia が GoldenLayout 相当のドッキング（タブ化・フロート・表示切替）を提供。
- 1つのコードベースで Windows (.exe) / macOS (.dmg) を出力でき、現行の配布形態を維持できる。

### 2.2 採用パッケージ一覧（具体名）

| パッケージ | 用途 |
|---|---|
| `Avalonia` / `Avalonia.Desktop` / `Avalonia.Themes.Fluent` (11.x) | UI基盤 |
| `CommunityToolkit.Mvvm` (8.x) | MVVM（`[ObservableProperty]`, `RelayCommand`） |
| `Dock.Avalonia` (11.x) | ドッキングレイアウト |
| `SkiaSharp` (2.88+) | キャンバス描画（Avalonia経由 or カスタムコントロール） |
| `System.Text.Json`（標準） | project.json のシリアライズ |
| `xunit` + `Verify.Xunit` | 単体テスト・スナップショットテスト |
| `Velopack` | Windows 配布（自動更新付きインストーラ） |

---

## 3. ソリューション構成

**UI非依存の Core と、Avalonia 依存の App を厳密に分離**します。
出力エンジンとデータモデルを先に Core として完成させ、テストで固めてから UI を作る戦略です。

```
SiteBuilder.sln
├─ src/
│  ├─ SiteBuilder.Core/                  # UI依存ゼロ（net8.0）
│  │  ├─ Models/
│  │  │  ├─ ProjectData.cs              # project.json 互換モデル（§4）
│  │  │  ├─ PageData.cs / FolderData.cs
│  │  │  ├─ ElementData.cs / TransformData.cs / ElementProperties.cs
│  │  │  └─ ProjectSerializer.cs        # System.Text.Json 設定を一元化
│  │  ├─ Export/
│  │  │  ├─ HtmlRenderer.cs             # ← renderer.js
│  │  │  ├─ CssHelpers.cs               # ← css-generator.js
│  │  │  ├─ ComponentRenderers.cs       # ← render-components.js
│  │  │  ├─ StaticSiteBuilder.cs        # ← exporter.js buildStaticProject
│  │  │  ├─ LaravelProjectBuilder.cs    # ← exporter.js buildLaravelProject
│  │  │  └─ ExportPayload.cs            # { Files, Images } 出力物モデル
│  │  └─ Services/
│  │     ├─ ExportWriter.cs             # ← main.js export-project（safeResolve含む）
│  │     └─ ImageStore.cs               # data:URL画像のメモリ管理
│  │
│  └─ SiteBuilder.App/                   # Avalonia（net8.0）
│     ├─ Program.cs / App.axaml
│     ├─ Views/
│     │  ├─ MainWindow.axaml            # メニュー + Dock.Avalonia レイアウト
│     │  ├─ Panels/                     # Tools / Pages / Explorer / Settings / Inspector
│     │  └─ Dialogs/
│     ├─ ViewModels/                    # 各パネルの VM（CommunityToolkit.Mvvm）
│     ├─ CanvasEditor/                  # ← canvas/ + nodes/ + interaction/（§6）
│     │  ├─ EditorCanvasControl.cs      # Skia描画のカスタムControl
│     │  ├─ SceneGraph/                 # EditorNode / GroupNode / TextNode ...
│     │  ├─ Tools/                      # 選択・移動・リサイズ・スナップ・パン
│     │  ├─ Adorners/                   # 変形ハンドル・ガイド・定規
│     │  └─ History/UndoService.cs      # ← history.js（スナップショット方式を踏襲）
│     └─ Services/
│        ├─ DialogService.cs            # ← main.js の各ダイアログIPC
│        └─ PreviewService.cs           # ← preview.js（§6.5）
│
└─ tests/
   └─ SiteBuilder.Core.Tests/
      ├─ HtmlRendererTests.cs           # ← renderer.test.js 移植
      ├─ ExporterTests.cs               # ← exporter.test.js 移植
      └─ GoldenFiles/                   # JS版出力との一致検証用（§8）
```

**ポイント: Electron の main/renderer 間 IPC は全廃**できます。C# では
ダイアログもファイルI/Oも同一プロセスなので、`export-project` / `load-scene` /
`pick-image` / `save-scene` の4つの IPC ハンドラは `DialogService` +
`ExportWriter` の直接メソッド呼び出しになります。

---

## 4. データモデルの C# 定義（project.json 互換）

既存の project.json をそのまま読み書きできるよう、**camelCase + null許容**で定義します。

```csharp
// Models/ProjectData.cs
public sealed class ProjectData
{
    public ProjectSettings Settings { get; set; } = new();
    public List<FolderData> Folders { get; set; } = [];
    public List<PageData> Pages { get; set; } = [];
    public string ActivePageId { get; set; } = "page_1";
}

public sealed class ProjectSettings
{
    public string ProjectName { get; set; } = "my-site";
    public CanvasSettings Canvas { get; set; } = new();
    public string OutputType { get; set; } = "static";   // "static" | "laravel"
    public bool SeparateCss { get; set; } = true;
    public string SiteBgColor { get; set; } = "#f1f2f6";
    public SeoSettings Seo { get; set; } = new();
}

public sealed class CanvasSettings
{
    public int Width { get; set; } = 800;
    public int Height { get; set; } = 600;
    public int MobileWidth { get; set; } = 375;
    public int MobileHeight { get; set; } = 800;
}

public sealed class PageData
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public List<ElementData> Elements { get; set; } = [];
    public string? FolderId { get; set; }
    public string BgColor { get; set; } = "";
    public SeoSettings Seo { get; set; } = new();
}

public sealed class ElementData
{
    public string Id { get; set; } = "";
    public string Type { get; set; } = "";   // Button/Rect/Circle/Triangle/Group/TextInput/Label/Image/Slider/...
    public TransformData Transform { get; set; } = new();
    public ElementProperties Properties { get; set; } = new();
    public List<ElementData>? Children { get; set; }    // Group のみ
}

public sealed class TransformData
{
    public int X { get; set; }
    public int Y { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
}
```

`properties` は要素タイプごとにキーが揺れる（`bgcolor`, `text`, `fontsize`, `role`,
`route`, `animation`, `shadow`, `bgimage`, `visible`, `lock`, `event` ...）ため、
**既知プロパティは型付き + 未知キーは `[JsonExtensionData]` で保持**します。
これにより「古い/新しいバージョンの project.json を開いても情報を落とさない」ことを保証します。

```csharp
public sealed class ElementProperties
{
    public string? Name { get; set; }
    public string? Text { get; set; }
    public string? BgColor { get; set; }        // JSON名 "bgcolor"（JsonPropertyName指定）
    public string? Color { get; set; }
    public double? FontSize { get; set; }       // "fontsize"
    public string? FontFamily { get; set; }     // "fontfamily"
    public string? Align { get; set; }
    public string? Shadow { get; set; }
    public string? Animation { get; set; }
    public string? Role { get; set; }           // Button: "submit" 等
    public string? Route { get; set; }          // フォーム action / リンク先
    public bool? Visible { get; set; }
    public bool? Lock { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? Extra { get; set; }  // 未知キーの保全
}
```

シリアライズ設定は 1 箇所に集約します:

```csharp
public static class ProjectSerializer
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping, // 日本語をエスケープしない
        WriteIndented = true,
    };
}
```

---

## 5. モジュール対応マップ（JS → C#）

| 現行 JS | C# 側 | 備考 |
|---|---|---|
| `main/main.js` ウィンドウ・メニュー | `MainWindow.axaml` + `NativeMenu` | Avalonia は Mac ネイティブメニューにも対応 |
| `main/main.js` `safeResolve()` | `ExportWriter.SafeResolve()` | `Path.GetFullPath` + 前方一致検査で同一実装。パストラバーサル遮断は必ず維持 |
| `main/main.js` 各 IPC | `DialogService` / `ExportWriter` の直接呼び出し | IPC 層は消滅 |
| `main/preload.js` | 不要 | 同上 |
| `app/state.js` | `EditorState`（シングルトンVM） | 選択・デバイス(pc/mobile)・キャンバスサイズ |
| `app/main-renderer.js` | `App.axaml.cs` + DI 登録 | 起動時の配線 |
| `project/project.js` | `ProjectService` | ページ/フォルダのCRUD・切替 |
| `project/api.js` | `DialogService` | 保存/読込/画像選択 |
| `nodes/converter.js` | `SceneSerializer`（SceneGraph ⇄ ElementData） | Circle/Triangle の中心→左上座標変換も移植 |
| `nodes/elements.js` | `NodeFactory` + `EditorState.ApplySelection` | タイプ別連番採番（`nextNumberForType`）も移植 |
| `nodes/node-style.js` | `NodeStylePainter`（SkiaSharp描画側） | 影・グラデ・枠線 |
| `nodes/components.js` | `ComponentTemplates`（静的データ） | Hero/Card/FAQ/Slider/ArticleGrid/Accordion のJSON定義をそのまま C# オブジェクトに |
| `nodes/warp.js` | `TextWarpRenderer`（`SKPath` + `SKTextBlob`） | 難所。Phase 5 送り |
| `canvas/canvas.js` `display.js` | `EditorCanvasControl` | Skia描画・ズーム・パン |
| `canvas/rulers.js` | `RulerControl` + ガイド管理 | |
| `canvas/canvas-preview.js` `offscreen.js` | `SKSurface` オフスクリーン描画 | サムネイル生成 |
| `canvas/gradient-overlay.js` `effect-overlay.js` | Adorner レイヤー | |
| `interaction/events.js` | `SelectionTool` / `SnapEngine` | ドラッグ・リサイズ・Shift複数選択・Alt吸着オフ・Spaceパン |
| `interaction/transform-normalize.js` | `TransformNormalizer` | scale→width/height 正規化 |
| `interaction/text-edit.js` | キャンバス上に `TextBox` をオーバーレイ配置 | ダブルクリック編集 |
| `interaction/clipboard.js` | `ClipboardService`（ElementData の JSON をコピー） | |
| `history/history.js` | `UndoService` | **シーン全体スナップショット方式を踏襲**（実装80行の単純さを維持） |
| `inspector/*` | `InspectorView` + タイプ別テンプレート | XAML の `DataTemplate` 切替で実現。slider-editor / accordion-editor は専用サブビュー |
| `explorer/*` | `ExplorerView`（TreeView） / `PagesView` | ドラッグ並べ替え対応 |
| `ui/dock-layout.js` | Dock.Avalonia のレイアウト定義 | パネル表示切替・初期状態リセット |
| `ui/toast.js` | `ToastService`（`WindowNotificationManager`） | Avalonia 標準機能 |
| `ui/settings-ui.js` | `SettingsView` | |
| `preview/preview.js` | `PreviewService` | §6.5 参照 |
| `export/*` | `SiteBuilder.Core.Export.*` | §3 の通り 1:1 対応。**最優先で移植** |

---

## 6. キャンバスエディタの設計（最大の難所）

Konva が担っていた「シーングラフ + ヒットテスト + 変形ハンドル」は自作します。
必要機能は限定的（矩形ベースの要素、回転なし、8方向リサイズ）なので、フル互換の
Konva クローンは不要です。

### 6.1 シーングラフ

```csharp
public abstract class EditorNode
{
    public string Id { get; set; } = "";
    public string UiType { get; set; } = "";
    public double X, Y, Width, Height;
    public ElementProperties Props { get; set; } = new();
    public GroupNode? Parent { get; set; }

    public abstract void Render(SKCanvas canvas);          // 描画
    public virtual bool HitTest(SKPoint p) =>              // ヒットテスト
        p.X >= X && p.X <= X + Width && p.Y >= Y && p.Y <= Y + Height;
}
// 派生: RectNode, CircleNode, TriangleNode, TextNode(Label/Button/TextInput),
//        ImageNode, GroupNode(children保持), SliderNode, AccordionNode ...
```

### 6.2 描画コントロール

`EditorCanvasControl : Control` が Avalonia の `Render()` 内で
`context.Custom(...)` → SkiaSharp lease を取り、以下の順で描く:

1. キャンバス背景（bgColor）
2. シーングラフを再帰描画（`visible=false` はスキップ、Group は座標系を平行移動）
3. 選択枠 + 8ハンドル（Konva Transformer 相当）
4. スナップガイド線・定規・ドラッグ矩形

ズーム/パンは `SKMatrix` 1枚で管理し、マウス座標は逆行列でシーン座標へ変換します。

### 6.3 インタラクション（events.js の移植方針）

現行の挙動仕様をそのまま要件化します:

- クリック選択 / Shift+クリックで範囲・追加選択（`lastClickedNode` 起点）
- Group クリック→Group移動、Group内子クリック→子だけ移動（draggable制御の移植）
- 近接要素・ガイドへの吸着、**Alt 押下中は吸着オフ**
- **Space 押下中はパンモード**（全ノードのドラッグ禁止）
- `lock` プロパティの要素は移動不可
- リサイズ後は scale を width/height に正規化（transform-normalize.js 準拠）

### 6.4 レスポンシブ（PC/Mobile 2レイアウト）

`display.js` の「デバイス切替時に transform セットを退避・復元する」方式を踏襲し、
`EditorNode` に `PcLayout` / `MobileLayout` の2つの Rect を持たせ、シリアライズ時は
現行仕様どおり **PC配置に一時復元してから保存**します（converter.js の
`temporarilyRestorePcLayout` 相当）。

### 6.5 プレビュー

現行 preview.js は生成HTMLをアプリ内表示しています。C# 版は2段階で対応します:

- **Phase 2（暫定）**: HtmlRenderer の出力を一時フォルダへ書き、既定ブラウザで開く（実装数行）
- **Phase 5（本対応）**: `WebViewControl-Avalonia` 等の WebView でアプリ内プレビュー

---

## 7. 移行フェーズ（実行計画）

「**純ロジックでテスト済みの出力エンジンから先に移植し、UIは後**」が方針です。
各フェーズに完了条件を付けます。工数は専任1名の目安です。

### Phase 0: 足場づくり（0.5週）
- ソリューション作成、CI（`dotnet build` / `dotnet test` の GitHub Actions）
- **完了条件**: 空の Avalonia ウィンドウが Win/Mac で起動する

### Phase 1: Core 移植 — 出力エンジンとモデル（2〜3週）★最重要
- §4 のモデル + `ProjectSerializer`（既存 project.json の読み書き互換）
- `CssHelpers` → `ComponentRenderers` → `HtmlRenderer` → `StaticSiteBuilder` /
  `LaravelProjectBuilder` の順に移植（依存の少ない順）
- vitest 273行を xUnit へ移植 + **ゴールデンテスト**（§8）
- **完了条件**: JS版と同一入力から**バイト一致のHTML/Blade/routes/FormController.php**が出る
- この時点で「project.json を食わせて書き出すだけの CLI」(`SiteBuilder.Cli`) を作れば、
  UI完成前から実用検証が可能

### Phase 2: アプリシェル（2週）
- MainWindow + メニュー（ファイル/編集/表示/ヘルプ、パネル表示チェック同期）
- Dock.Avalonia で6パネル配置（ツール/ページ/エクスプローラー/キャンバス/設定/プロパティ）+ レイアウトリセット
- `DialogService`（開く/保存/画像選択/出力先フォルダ選択）、`ExportWriter`（safeResolve 移植込み）
- **完了条件**: 既存 project.json を開いて（表示はまだ簡易でよい）そのまま書き出せる

### Phase 3: キャンバス最小編集（3〜4週）
- §6 のシーングラフ + 描画 + 選択/移動/リサイズ/削除 + タイプ別採番
- Undo（スナップショット方式）、ズーム/パン、SceneSerializer（ページ切替に必要）
- **完了条件**: 8基本要素を配置・編集・保存・出力する一連の操作が成立

### Phase 4: インスペクタとプロジェクト管理（3週）
- プロパティパネル（位置/色/フォント/角丸/影/グラデ/アニメ/フォーム設定/整列）
- ページ・フォルダ管理、エクスプローラー（並び順・表示切替）、プロジェクト設定/SEO
- **完了条件**: README 記載の「プロパティ」「ページとフォルダ」節の機能が全て動く

### Phase 5: 応用機能（3〜4週）
- テンプレ部品（Hero/Card/FAQ/Slider/ArticleGrid/Accordion）
- レスポンシブ PC/Mobile、定規とガイド、スナップ、テキスト直接編集、
  クリップボード、画像D&D、テキストワープ、アプリ内プレビュー
- **完了条件**: README の機能一覧を C# 版で全て再現

### Phase 6: 配布と切替（1〜2週）
- Velopack で Win インストーラ、`dotnet publish` + create-dmg で Mac 版
- README 更新、Electron 版は1リリース分並行維持 → 問題なければ廃止
- **完了条件**: 両OSのインストーラ配布 + 既存プロジェクトファイルでの動作確認

**合計目安: 約3.5〜4.5ヶ月（専任1名）。** Phase 1 完了時点で出力品質は保証されるため、
以降のリスクは UI 再現のみに限定されます。

---

## 8. 出力互換の保証（ゴールデンテスト）

「C#版に替えたら生成HTMLが変わった」を防ぐ仕組みを最初に作ります。

1. JS 側に使い捨てスクリプトを追加し、代表的なプロジェクト
   （全要素タイプ・Group入れ子・複数ページ・フォルダ・フォーム・CSS分離ON/OFF ×
   static/laravel）の**出力一式をフィクスチャとして `tests/GoldenFiles/` に保存**
2. C# 側テストで同じ入力 JSON から `StaticSiteBuilder` / `LaravelProjectBuilder` を実行し、
   **ファイルパス集合と各ファイル内容をバイト比較**
3. 差分が出たら改行コード・エスケープ・数値整形（`Math.Round` と JS `Math.round` の
   負数丸め差に注意）を疑う

これで exporter/renderer 系 1,300 行の移植品質を機械的に担保できます。

---

## 9. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| キャンバス操作感の再現不足（吸着・Group内選択など） | ユーザー体験の劣化 | events.js の挙動を §6.3 のように仕様書化してから実装。Electron版と並べて手動比較 |
| テキストワープ・エフェクトの描画差 | 見た目の差異 | Phase 5 に隔離。SKPath ベースで再実装し、出力HTMLには影響しない（編集時表示のみ）ことを確認 |
| フォント描画差（Canvas と Skia の行間・メトリクス） | テキスト折返し位置のズレ | 出力HTMLはブラウザが描画するため実害は編集画面のみ。許容差として文書化 |
| Dock.Avalonia のレイアウト永続化仕様差 | パネル配置の使い勝手 | 初期レイアウトのみ再現し、細かい永続化は後回しにできる |
| JS の緩い型（properties の揺れ） | 読み込み時の情報欠落 | `[JsonExtensionData]` で未知キーを必ず往復保存（§4） |
| 2実装の並行期間の二重メンテ | 工数増 | Electron 版は Phase 1 完了後フィーチャーフリーズし、バグ修正のみ |

---

## 10. 代替案（フル移行が重い場合）

**Blazor Hybrid 段階移行案**: 出力エンジン（export/ 一式）とファイルI/Oだけを
C#（= 本計画の Phase 0〜2 相当）に移し、キャンバス編集 UI は WebView 内で
現行の Konva/JS コードを流用する構成です。

- 利点: 難所の canvas/interaction 約1,800行を書き直さずに済み、1〜1.5ヶ月で C# 化の第一歩が出せる
- 欠点: JS 資産が残り続け「C#への移行」としては不完全。JS⇄C# のブリッジ層が新たな複雑さになる
- 位置づけ: 本計画の**保険**。Phase 3 で工数超過が見えた場合の退避先として温存する

---

## 11. まとめ

1. **中心はデータ（project.json）と出力エンジン**。ここを .NET 8 の `SiteBuilder.Core` として
   先に移植し、ゴールデンテストでJS版とバイト一致を保証する（Phase 1）
2. UI は **Avalonia 11 + Dock.Avalonia + SkiaSharp 自作キャンバス**で再構築し、
   Win/Mac 両対応という現行の価値を維持する（Phase 2〜5）
3. 既存ユーザーのプロジェクトファイルは**無変換でそのまま開ける**ことを互換性の絶対条件とする
4. 総工数目安は専任1名で約4ヶ月。リスクが読めない場合は §10 の Blazor Hybrid 案へ切替可能
