# Site Builder C# 移行計画書（v2）

**最優先要件: 現在の見た目・機能・操作感を完全に維持したまま C# 化する。**

この要件を踏まえ、v1（Avalonia でのフルネイティブ書き直し）から方針を改訂しました。
UI をネイティブに書き直す限り「完全に同じ操作感」は原理的に保証できません。
一方で本アプリの UI・編集機能は全て `src/renderer/`（HTML/CSS/JS 約7,600行）に閉じており、
Electron 固有の部分は**わずか7つのブリッジAPIとメニューだけ**です（§3で実証）。

したがって本計画は:

> **既存の Web UI（renderer）を一切変更せずそのまま動かし、
> Electron の殻と出力エンジンを C#（.NET）に置き換える。**

これにより見た目・機能・操作感は「似せる」のではなく「同一のコードが動く」ことで保証されます。
フルネイティブ化（v1案）は将来の任意ステップとして付録に残します。

---

## 1. 現状分析（移行対象の棚卸し）

### 1.1 アプリの正体

リポジトリ名に「Laravel」と付いていますが、**PHPコードは含まれていません**。
実体は以下の構成の **Electron デスクトップアプリ** です。

- **Electron メインプロセス** (`src/main/`, 298行): ウィンドウ生成、ネイティブメニュー、
  ファイルダイアログ、プロジェクト書き出しの IPC 受け口
- **レンダラー** (`src/renderer/`, 約7,600行): Konva ベースのキャンバスエディタ、
  ドッキングパネル UI、HTML/Laravel Blade 生成エンジン
- 同梱ライブラリ: Konva（キャンバス）、GoldenLayout（ドッキング）、Pickr（カラーピッカー）、jQuery

### 1.2 「見た目・機能・操作感」がどこに実装されているか

| 体験要素 | 実装場所 | C#移行での扱い |
|---|---|---|
| パネルレイアウト・ドッキング | renderer (GoldenLayout + dock-layout.js) | **無改変で流用** |
| キャンバス編集（選択・ドラッグ・スナップ・Group挙動・Spaceパン） | renderer (Konva + interaction/) | **無改変で流用** |
| プロパティパネル・カラーピッカー・各エディタ | renderer (inspector/) | **無改変で流用** |
| ページ/フォルダ・エクスプローラー・Undo・プレビュー | renderer | **無改変で流用** |
| キーボードショートカット | renderer (events.js) ＋ メニューaccelerator | ほぼ流用（§4.3） |
| ネイティブメニュー（ファイル/編集/表示/ヘルプ） | main.js (Electron Menu) | **C#で再実装**（§4.3） |
| ファイルダイアログ・書き出し・画像選択 | main.js (Electron dialog/fs) | **C#で再実装**（OSネイティブダイアログなので見た目同一） |
| HTML/Blade 出力エンジン | renderer (export/, 純ロジック1,328行) | **C#へ移植**（出力バイト一致を保証、§6） |

つまり操作感を決めるコードの実体はほぼ全て renderer にあり、そこは触りません。

### 1.3 Electron 依存の全リスト（これだけ置き換えれば良い）

`preload.js` が renderer に公開している API は以下の **7つで全て**です
（renderer 側の利用箇所は `project/api.js` に集約済み）:

| API | 方向 | 内容 |
|---|---|---|
| `exportProject(payload)` | JS→C# | `{files:[{path,content}], images:[{path,dataUrl}], projectName, targetDir?}` を受けてディスク書き出し。初回はフォルダ選択ダイアログ |
| `pickImage()` | JS→C# | 画像選択ダイアログ → `{dataUrl, name}` を返す |
| `saveScene(jsonStr)` | JS→C# | 保存ダイアログ → JSON書き出し |
| `loadScene()` | JS→C# | 開くダイアログ → `{content, dirPath}` を返す |
| `onMenuAction(cb)` | C#→JS | メニュー操作（new-project / open-project / save-export / undo / reset-layout）の通知 |
| `onTogglePanel(cb)` | C#→JS | 「表示」メニューのパネル開閉 `{id, show}` の通知 |
| `notifyPanelState(id, open)` | JS→C# | パネル開閉をメニューのチェックへ同期 |

加えてメニューの role 系（cut/copy/paste/quit/reload/devtools）と、
外部リンクを既定ブラウザで開く処理、`safeResolve()`（パストラバーサル遮断）が main.js にあります。

---

## 2. 技術選定

### 2.1 ホスト方式の比較

「UIを無改変で動かす」ための C# ホストの選択肢:

| 候補 | Win | Mac | 描画エンジン | 評価 |
|---|:-:|:-:|---|---|
| **Photino.NET**（推奨） | ○ | ○ | Win: WebView2(Chromium) / Mac: WKWebView | ◎ Electron代替を目的とした純.NETホスト。軽量・配布サイズ小。Node/Electron完全排除 |
| Electron.NET | ○ | ○ | Chromium（Electronそのまま） | ○ 見た目・メニュー完全同一だが Electron+Node が残り「脱Electron」にならない。メンテ状況に不安 |
| WPF + WebView2 | ○ | × | Chromium | △ Mac対応を失う |
| Avalonia + WebView系 | ○ | ○ | CefGlue等 | △ 依存が重く、Photinoに対する利点が薄い |

**結論: .NET 8 LTS + Photino.NET を採用します。**

- Windows は WebView2 = Chromium なので、現行 Electron（Chromium）と**描画・挙動が実質同一**
- macOS は WKWebView（Safari系）になる。Konva / GoldenLayout / Pickr はいずれも
  Safari 対応済みライブラリだが、差異検証を Phase 1 の完了条件に含める（§7 リスク参照）。
  万一許容できない差異が出た場合のみ、Mac に限り Electron.NET 併用へ退避可能
- 万全を期すなら Electron.NET 案（UI殻まで完全同一）も §2.1 の通り選択肢として温存

### 2.2 採用パッケージ

| パッケージ | 用途 |
|---|---|
| `Photino.NET` (3.x) | ネイティブウィンドウ + OS WebView ホスト |
| `System.Text.Json`（標準） | project.json / ブリッジメッセージのシリアライズ |
| `xunit` + ゴールデンファイル比較 | 出力エンジンの互換テスト（§6） |
| `Velopack` | Windows 配布（NSIS 相当のインストーラ + 自動更新） |
| `dotnet publish` + create-dmg | macOS 配布（dmg） |

---

## 3. 新アーキテクチャ

```
┌─────────────────────────────────────────────┐
│ SiteBuilder.Host (C# / Photino.NET)          │
│  ・ウィンドウ生成 / メニュー / ダイアログ     │
│  ・ブリッジ7APIの実装 (§4)                    │
│  ・ExportWriter (safeResolve 含む)            │
│  ┌─────────────────────────────────────┐    │
│  │ OS WebView                           │    │
│  │  src/renderer/ 一式を無改変でロード   │    │
│  │  (Konva / GoldenLayout / inspector / │    │
│  │   canvas / interaction / export ...) │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
        │ Step 2 で出力エンジンを移設
        ▼
  SiteBuilder.Core (C#)  … HtmlRenderer / StaticSiteBuilder / LaravelProjectBuilder
```

```
SiteBuilder.sln
├─ src/
│  ├─ SiteBuilder.Host/            # Photino ホスト（ウィンドウ・メニュー・ブリッジ・I/O）
│  │  ├─ Program.cs
│  │  ├─ Bridge/BridgeDispatcher.cs   # §4.2 のメッセージルータ
│  │  ├─ Bridge/DialogService.cs      # フォルダ/ファイル/画像ダイアログ
│  │  ├─ Bridge/ExportWriter.cs       # main.js の export-project 相当 + SafeResolve
│  │  └─ wwwroot/ → ../renderer へのリンク（renderer は現位置のまま）
│  ├─ SiteBuilder.Core/            # Step 2: 出力エンジン + モデル（UI依存ゼロ）
│  │  ├─ Models/…                     # §5 の project.json 互換モデル
│  │  └─ Export/…                     # HtmlRenderer / CssHelpers / 各Builder
│  └─ renderer/                    # 既存 src/renderer を無改変で移設（または現位置参照）
│     └─ host-bridge.js            # ★唯一の追加ファイル（§4.1、preload.js の代替 shim）
└─ tests/SiteBuilder.Core.Tests/   # ゴールデンテスト（§6）
```

**renderer 本体のコードには手を入れません。** 追加は `host-bridge.js` 1ファイルと、
`index.html` にそれを読み込む `<script>` 1行のみです。

---

## 4. ブリッジ実装仕様（操作感維持の要）

### 4.1 renderer 側 shim（host-bridge.js、約40行の新規ファイル）

Photino の `window.external.sendMessage` / `receiveMessage` の上に、
**preload.js と完全に同じ形の `window.electronAPI`** を定義します。
これにより `project/api.js` 以下の既存コードは 1 文字も変わりません。

```js
// host-bridge.js — window.electronAPI を Photino メッセージング上に再現する
(function () {
    let seq = 0;
    const pending = new Map();          // 要求ID → resolve
    const listeners = { 'menu-action': [], 'toggle-panel': [] };

    window.external.receiveMessage((raw) => {
        const msg = JSON.parse(raw);
        if (msg.replyTo != null) {                    // C#からの応答
            pending.get(msg.replyTo)?.(msg.result);
            pending.delete(msg.replyTo);
        } else if (listeners[msg.channel]) {          // C#からのイベント
            listeners[msg.channel].forEach(cb => cb(msg.payload));
        }
    });

    function invoke(channel, payload) {
        return new Promise((resolve) => {
            const id = ++seq;
            pending.set(id, resolve);
            window.external.sendMessage(JSON.stringify({ id, channel, payload }));
        });
    }

    window.electronAPI = {
        exportProject: (payload) => invoke('export-project', payload),
        pickImage:     ()        => invoke('pick-image'),
        saveScene:     (json)    => invoke('save-scene', json),
        loadScene:     ()        => invoke('load-scene'),
        onMenuAction:  (cb) => listeners['menu-action'].push((a) => cb(a)),
        onTogglePanel: (cb) => listeners['toggle-panel'].push((p) => cb(p)),
        notifyPanelState: (id, open) =>
            window.external.sendMessage(JSON.stringify({ channel: 'panel-state-changed', payload: { id, open } })),
    };
})();
```

### 4.2 C# 側ディスパッチャ

```csharp
// Bridge/BridgeDispatcher.cs（骨子）
window.RegisterWebMessageReceivedHandler(async (sender, raw) =>
{
    var msg = JsonSerializer.Deserialize<BridgeMessage>(raw)!;
    object? result = msg.Channel switch
    {
        "export-project"      => await _exportWriter.ExportAsync(msg.Payload),  // main.jsと同一仕様
        "pick-image"          => await _dialogs.PickImageAsync(),               // → {dataUrl, name}
        "save-scene"          => await _dialogs.SaveSceneAsync(msg.Payload),
        "load-scene"          => await _dialogs.LoadSceneAsync(),               // → {content, dirPath}
        "panel-state-changed" => _menu.SyncPanelCheck(msg.Payload),             // 応答不要
        _ => null,
    };
    if (msg.Id is int id)
        window.SendWebMessage(JsonSerializer.Serialize(new { replyTo = id, result }));
});
```

`ExportWriter` は main.js の挙動を**仕様として**移植します:

- `targetDir` 未指定時のみフォルダ選択ダイアログ → `選択フォルダ/プロジェクト名/` に出力
- `SafeResolve(baseDir, relPath)`: `Path.GetFullPath` 結果が `baseDir` 配下でなければ例外
  （パストラバーサル遮断。**現行の安全策を必ず維持**）
- 成否は `{success, path}` / `{success:false, message}` で返す（キャンセル時メッセージ
  「キャンセルされました」も一致させる — renderer がこの文字列でトースト分岐しているため）

### 4.3 メニュー

main.js のメニュー定義（ファイル/編集/表示/ヘルプ、パネル表示チェック、
`CmdOrCtrl+Z` 等）を C# 側で再現します。

- **Windows**: 現行 Electron もウィンドウ内メニューバー表示のため、
  Win32 ネイティブメニュー（P/Invoke）または HTML メニューバーで同位置・同項目を再現
- **macOS**: 現行はグローバルメニューバー。Photino の Mac メニュー対応状況を Phase 1 冒頭で
  検証し、不足があれば NSMenu を interop で構築（項目数が少ないため現実的）
- role 系（切り取り/コピー/貼り付け）は WebView の標準編集コマンドへ委譲、
  `再読み込み`/`開発者ツール` は WebView API で同等機能を提供
- 外部リンクは現行同様、既定ブラウザで開く（アプリ内遷移は遮断）

### 4.4 その他の互換ポイント

- **オートセーブの localStorage バックアップ**（api.js）: WebView のプロファイル保存先を
  固定ディレクトリに設定し、アプリ更新後もバックアップが残ることを確認する
- **画像のドラッグ＆ドロップ**: renderer 内の `FileReader` 処理で完結しており WebView でもそのまま動く
- **ウィンドウ**: 1400×900・最小 1000×700 を同値で設定

---

## 5. 出力エンジンの C# 化（Step 2）と互換データモデル

UI と切り離せる純ロジック（`export/` 1,328行）を `SiteBuilder.Core` へ移植します。
移植中も**アプリは JS 版エンジンで動き続ける**ため、ユーザー影響ゼロで進められます。

- データモデル: project.json と**無変換互換**の C# クラス群
  （camelCase、既知プロパティは型付き、未知キーは `[JsonExtensionData]` で往復保全）
- 対応: `renderer.js → HtmlRenderer.cs` / `css-generator.js → CssHelpers.cs` /
  `render-components.js → ComponentRenderers.cs` /
  `exporter.js → StaticSiteBuilder.cs + LaravelProjectBuilder.cs`
- 切替方法: ブリッジに `export-project-v2`（project JSON を受けて C# 側で生成）を追加し、
  設定フラグで JS 生成と切替可能にする。ゴールデンテスト（§6）で一致確認後に既定を C# へ
- vitest のテスト 273 行は xUnit へ移植

※ v1 計画の §4「データモデルの C# 定義」の具体コードはそのまま本 Step で使用します
（[付録A](#付録a-v1フルネイティブ化案の要約) 参照）。

---

## 6. 互換性の保証方法（テスト戦略）

「そのまま使える」を機械的に検証します。

1. **UI互換**: renderer を無改変流用するため、UI ロジックの互換テストは不要。
   代わりに「Electron 依存7API + メニュー」の**受け入れチェックリスト**
   （README の全機能節: ツール/プロパティ/マウス操作/ショートカット/ページとフォルダ/
   レスポンシブ/定規とガイド/プレビュー/保存と読み込み/出力タイプ）を Electron 版と
   並べて同一挙動確認する
2. **出力互換（ゴールデンテスト）**: 代表プロジェクト（全要素タイプ・Group入れ子・複数ページ・
   フォルダ・フォーム・CSS分離ON/OFF × static/laravel）について、JS 版出力一式を
   フィクスチャ保存し、C# 版 `SiteBuilder.Core` の出力と**パス集合・ファイル内容をバイト比較**
3. **プロジェクト互換**: 既存 project.json の読み込み → 再保存でデータが欠落しないことを
   ラウンドトリップテストで保証

---

## 7. 移行ステップ（実行計画）

工数は専任1名の目安です。v1 案（約4ヶ月）に対し、**約1.5〜2ヶ月**で完了します。

### Step 0: 足場（0.5週）
- ソリューション作成、CI（`dotnet build/test` + 既存 `vitest` の並走）
- **Mac の WKWebView / メニュー対応の技術検証**（リスクの早期潰し込み）
- 完了条件: Photino ウィンドウで renderer の画面が表示される

### Step 1: Electron 殻の C# 置換（2〜3週）★ここで「そのまま動く」を達成
- `host-bridge.js` shim + `BridgeDispatcher` + `DialogService` + `ExportWriter`（safeResolve込み）
- メニュー再現（Win / Mac）、外部リンク処理、ウィンドウ設定
- §6-1 の受け入れチェックリストを Electron 版と突き合わせ
- 完了条件: **既存 UI が無改変で全機能動作し、Electron/Node への依存が消える**。
  この時点で配布可能（出力エンジンはまだ JS 版のまま＝出力も従来と完全同一）

### Step 2: 出力エンジンの C# 移植（2〜3週）
- §5 のモデル + Export 群を移植、vitest→xUnit 移植、ゴールデンテストでバイト一致
- フラグで JS/C# 生成を切替 → 一致確認後に C# を既定化
- 完了条件: ゴールデンテスト全通過、C# 生成が既定で有効

### Step 3: 配布と切替（1週）
- Velopack（Win インストーラ）/ dmg 生成、README 更新
- Electron 版は1リリース分並行維持 → 問題なければ `src/main/` と electron 依存を削除
- 完了条件: 両OS配布物で既存プロジェクトの開閉・編集・出力を確認

### Step 4（任意・将来）: フルネイティブ化
- 必要になった場合のみ、付録Aの v1 案（Avalonia + SkiaSharp）へ進む。
  Step 2 で Core が完成しているため、v1 案の Phase 1 は消化済みの状態から始められる

---

## 8. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| Mac の WKWebView と Chromium の描画・挙動差 | Mac版の操作感 | Step 0 で先行検証。Konva/GoldenLayout はSafari対応済み。許容不能なら Mac のみ Electron.NET 退避 |
| Photino のネイティブメニュー対応不足 | メニューUX | 項目が少なく（4メニュー・約15項目）、Win32/NSMenu interop で再現可能。Step 0 で方式確定 |
| WebView プロファイル移動によるオートセーブバックアップ消失 | 未保存データ | プロファイルディレクトリ固定 + 初回起動時に旧 localStorage からの移行は不要（バックアップは一時用途）だが挙動を文書化 |
| JS↔C# メッセージの JSON 差異（数値丸め・エスケープ・null） | 保存/出力の劣化 | `UnsafeRelaxedJsonEscaping` + ラウンドトリップテスト（§6-3）で担保 |
| 出力エンジン移植のミス | 生成HTMLの差異 | ゴールデンテストでバイト一致を必須化（§6-2）。一致まで JS 版を既定に維持 |
| WebView2 ランタイム未導入の Windows 環境 | 起動不可 | Velopack のブートストラップで Evergreen WebView2 を自動導入 |

---

## 9. まとめ

1. **UIは書き直さない。** 見た目・機能・操作感は renderer 約7,600行を無改変で動かすことで
   「同一コードの実行」として保証する
2. C# 化の対象は **Electron の殻（7つのブリッジAPI + メニュー + ファイルI/O）** と
   **出力エンジン（純ロジック1,328行）** に限定する
3. Step 1 完了時点（2〜3週）で Electron/Node 依存が消え、従来と同じ操作感のC#製アプリが成立。
   Step 2 でロジックの本体も C# になり、総工数は約1.5〜2ヶ月
4. フルネイティブ化は要件が変わった時のみ付録Aの計画で実施すればよい

---

## 付録A: v1（フルネイティブ化案）の要約

将来 UI もネイティブ化したくなった場合の計画（初版の全文は本ファイルの Git 履歴を参照）。

- **技術**: .NET 8 + Avalonia UI 11 + Dock.Avalonia + SkiaSharp 自作シーングラフ
- **構成**: `SiteBuilder.Core`（本計画 Step 2 で完成済み）+ `SiteBuilder.App`（Avalonia UI）
- **難所**: Konva 相当のキャンバス（選択・変形ハンドル・スナップ・Group内選択・Spaceパン・
  PC/Mobile 2レイアウト）の再実装、テキストワープ、フォントメトリクス差
- **データモデル**: project.json 互換 C# モデル（camelCase + `[JsonExtensionData]`。
  `ProjectData` / `ProjectSettings` / `CanvasSettings` / `PageData` / `ElementData` /
  `TransformData` / `ElementProperties` — 本計画 Step 2 と共通）
- **工数目安**: Core 完成済み前提で追加 約2.5〜3.5ヶ月（専任1名）
- **注意**: ネイティブ化した瞬間に「操作感の完全一致」は保証から近似に変わる。
  実施判断は Electron/WebView 依存を排除すべき明確な理由が生じた時に限る
