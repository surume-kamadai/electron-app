# 改善計画 兼 作業手順書

Site Builder（Electron版）の現状課題の改善と、新機能「CSSファイル分離生成」の実装手順をまとめたドキュメント。
上から順に着手することを想定している（Phase 1 でテストを回せるようにしてから機能追加に入る）。

- 対象リポジトリ: `surume-kamadai/electron-app`
- 作成日: 2026-07-13
- 前提: Node.js 22 / npm が使えること

---

## 現状サマリ

| 項目 | 状態 |
|---|---|
| コード規模 | 約 9,400 行（renderer 配下 11 ディレクトリに分割済み） |
| テスト | `src/renderer/export/*.test.js` が存在するが **vitest 未導入で実行不可** |
| 外部ライブラリ | Konva / jQuery / GoldenLayout 1.5.9 / Pickr を **CDN 読み込み（オフライン起動不可）** |
| デッドコード | `utils/css-generator.js`・`utils/gradient-overlay.js`・`utils/effect-overlay.js`・`editor/rgba-picker.js` が未参照 |
| CI / lint | なし |
| CSS 出力 | 生成 HTML の `<head>` 内 `<style>` に埋め込み（分離機能なし → 本書 Phase 5 で追加） |

---

## Phase 1: すぐできる整備（低リスク）

### 1-1. vitest 導入とテスト実行環境

1. devDependencies に vitest を追加する。

   ```bash
   npm install -D vitest
   ```

2. `package.json` の scripts に追加する。

   ```json
   "test": "vitest run",
   "test:watch": "vitest"
   ```

3. `npm test` を実行し、既存の `renderer.test.js` / `exporter.test.js` が全件パスすることを確認する。
   （失敗するテストがあれば、この時点で直すか issue 化しておく）

### 1-2. デッドコードの削除

以下 4 ファイルはどこからも import されていない（分割リファクタ時の残骸）。削除する。

```bash
git rm src/renderer/utils/css-generator.js
git rm src/renderer/utils/gradient-overlay.js
git rm src/renderer/utils/effect-overlay.js
git rm src/renderer/editor/rgba-picker.js
```

- 注意: `utils/color.js` は `canvas/` 側などから参照されているため**削除しない**。
- 削除後 `npm start` でアプリが起動し、`npm test` が通ることを確認する。

### 1-3. README の構成図更新

`README.md` の「構成」節が旧構成（`editor/` 11 モジュール）のまま。現状の
`app / canvas / explorer / export / history / inspector / interaction / nodes / project / ui / utils`
構成に書き換える。

### 1-4. electron-builder 設定の整備

`package.json` の `build` セクションを実配布向けに直す。

- `appId` を `com.example.site-builder` から実際の ID へ変更
- `author` を記入
- アプリアイコン（`build/icon.ico` / `build/icon.icns`）を用意して指定
- `files` から `*.test.js` を除外: `"!src/**/*.test.js"`

---

## Phase 2: 品質基盤

### 2-1. CDN ライブラリのローカル同梱（最重要）

現在 `src/renderer/index.html` が CDN から読むライブラリをアプリに同梱し、オフラインでも起動できるようにする。

1. npm で取得する。

   ```bash
   npm install konva jquery golden-layout@1.5.9 @simonwep/pickr
   ```

2. `src/renderer/vendor/` を作り、ビルド済みファイルをコピーするスクリプトを用意する
   （例: `scripts/copy-vendor.mjs` を作成し、`package.json` の `postinstall` で実行）。

   コピー対象:
   - `node_modules/konva/konva.min.js`
   - `node_modules/jquery/dist/jquery.min.js`
   - `node_modules/golden-layout/dist/goldenlayout.min.js` ＋ 同 CSS（base / dark テーマ）
   - `node_modules/@simonwep/pickr/dist/pickr.min.js` ＋ 同 CSS

3. `index.html` の `<script src="https://...">` / `<link href="https://...">` を `vendor/...` の相対パスに置換する。

4. ネットワークを切った状態で `npm start` し、エディタが完全に動作することを確認する。

- 補足: 出力 HTML 側の Swiper CDN（`renderer.js` 内）は「公開サイトが読む」ものなのでそのままで良い。

### 2-2. GitHub Actions で CI

`.github/workflows/ci.yml` を作成する。

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm test
```

lint 導入（2-3）後に `- run: npx eslint .` を追加する。

### 2-3. ESLint / Prettier 導入

```bash
npm install -D eslint prettier
```

- `eslint.config.mjs`（flat config）で ES モジュール + ブラウザ + Node（main プロセス用）環境を設定
- 既存コードのスタイル（4 スペース、シングルクォート）に合わせた `.prettierrc` を作成
- まず `--fix` で機械的に直せるものだけ適用し、大規模な手直しはしない

### 2-4. CSP の追加

`index.html` の `<head>` に CSP メタタグを追加する（2-1 のローカル同梱後なら `script-src 'self'` ベースにできる）。

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;">
```

- インラインイベントハンドラ（Phase 3-1）を排除するまでは `script-src` に `'unsafe-inline'` が必要な点に注意。段階的に絞る。

---

## Phase 3: 構造改善（中期）

### 3-1. インラインハンドラの排除

`index.html` に約 150 箇所ある `onclick="..."` / `onchange="..."` を `addEventListener` 登録へ移行し、
`window.*` へのグローバル公開（27 箇所）を段階的に廃止する。

- パネル単位（ツール → 設定 → インスペクタ …）で少しずつ移行し、都度動作確認する
- 完了後、CSP の `script-src` から `'unsafe-inline'` を外す

### 3-2. GoldenLayout 2.x への移行

GoldenLayout 1.5.9 は jQuery 依存の古いバージョン。2.x へ移行し jQuery を撤去する。
`ui/dock-layout.js` の API 呼び出しを 2.x 系に書き換える必要があるため、単独 PR で行う。

### 3-3. index.html の分割

パネルの HTML をモジュール側（各 `init〜()`）で生成するようにし、`index.html` を骨組みだけにする。

---

## Phase 4: 機能面の伸びしろ（バックログ）

- 自動保存（一定間隔で userData 配下へ）とクラッシュ復元
- 「最近使ったプロジェクト」メニュー
- 履歴のメモリ効率化（現状: JSON スナップショット 50 件 × ページ数）
- Electron の定期アップデート方針の決定

---

## Phase 5: 新機能「CSSファイル分離生成」

### 目的

現在、生成 HTML はレスポンシブ用 CSS（`.el-xxx` ルール群）とアニメーション CSS を
`<head>` 内の `<style>` タグに埋め込んでいる。これを **外部 CSS ファイルとして分離出力**できるようにする。

分離すると:

- HTML が読みやすくなり、出力後の手直しがしやすい
- 複数ページ間でアニメーション CSS（共通部分）をブラウザキャッシュで共有できる
- 将来「サイト全体のテーマ CSS を差し替える」といった拡張の土台になる

### 仕様

| 項目 | 内容 |
|---|---|
| 設定 | プロジェクト設定に「CSSを別ファイルに出力する」チェックボックスを追加。`settings.separateCss`（boolean、**既定 false** = 従来どおり埋め込み） |
| 静的出力 | `css/common.css`（アニメーション等の共通 CSS）＋ ページごとの `css/<ページ名>.css` を出力し、HTML からは `<link rel="stylesheet">` で参照 |
| Laravel 出力 | `public/css/` 配下に同様に出力し、Blade からは `{{ asset('css/....css') }}` で参照 |
| フォルダ内ページ | 静的出力ではフォルダ内 HTML から `../css/...` と相対参照。CSS ファイル名は `<フォルダ名>_<ページ名>.css` として衝突を防ぐ |
| 後方互換 | 既存の project.json（`separateCss` 無し）は false として読み込む。OFF 時の出力は現状と完全一致 |

### 出力イメージ（静的・分離 ON）

```
my-site/
├── index.html          ← <link rel="stylesheet" href="css/common.css">
│                          <link rel="stylesheet" href="css/index.css">
├── about.html
├── css/
│   ├── common.css      ← アニメーションCSS（全ページ共通）
│   ├── index.css       ← .site-canvas と .el-xxx ルール群
│   └── about.css
└── images/
```

### 実装手順

変更するファイルは 5 つ ＋ テスト 2 つ。

#### Step 1: `export/renderer.js` — HtmlRenderer に外部 CSS モードを追加

1. コンストラクタでオプションを受け取る。

   ```js
   this.cssHrefs = options.cssHrefs || null; // 例: ['css/common.css', 'css/index.css']
   this.extractedCss = null;                 // 分離モード時にここへ CSS 全文を溜める
   ```

2. `render()` 内の `<style>` 出力箇所（現在の 88〜89 行付近）を分岐させる。

   ```js
   if (this.cssHrefs) {
       // 分離モード: <link> を出力し、CSS本文は extractedCss に保持
       for (const href of this.cssHrefs) {
           html += `    <link rel="stylesheet" href="${escapeHtml(href)}">\n`;
       }
       this.extractedCss = cssString;   // ページ固有CSS（ANIM_CSS は common 側で出す）
   } else {
       // 従来モード: そのまま埋め込み
       html += '    <style>\n' + ANIM_CSS + '\n    </style>\n';
       html += '    <style id="dynamic-styles">\n    ' + cssString + '\n    </style>\n';
   }
   ```

3. 取得用メソッドを追加する。

   ```js
   getExtractedCss() { return this.extractedCss; }
   ```

- 注意: `render()` の戻り値（HTML 文字列）は変えない。既存呼び出し元・テストへの影響を避けるため。
- `ANIM_CSS` は css-generator.js から export 済みなので、common.css の中身は exporter 側で `ANIM_CSS` を使って組み立てる。

#### Step 2: `export/exporter.js` — 静的出力で CSS ファイルを組み立てる

`buildStaticProject()` のページループを修正する。

```js
const separate = !!project.settings?.separateCss;
if (separate) {
    files.push({ path: 'css/common.css', content: ANIM_CSS });
}

for (const page of (project.pages || [])) {
    const folderName = folderMap.get(page.folderId);
    // フォルダ内ページはファイル名衝突を避けるためプレフィックスを付ける
    const cssName  = folderName ? `${folderName}_${page.name}.css` : `${page.name}.css`;
    // フォルダ内 HTML から見た css/ への相対パス
    const prefix   = folderName ? '../' : '';
    const cssHrefs = separate ? [`${prefix}css/common.css`, `${prefix}css/${cssName}`] : null;

    const renderer = new HtmlRenderer(sceneData, { mode: 'static', imageMap, cssHrefs });
    const html = renderer.render();
    files.push({ path: filePath, content: html });

    if (separate) {
        files.push({ path: `css/${cssName}`, content: renderer.getExtractedCss() });
    }
}
```

- `ANIM_CSS` の import を exporter.js に追加する: `import { ANIM_CSS } from './css-generator.js';`

#### Step 3: `export/exporter.js` — Laravel 出力も同様に対応

`buildLaravelProject()` で:

- CSS ファイルは `public/css/<viewPathName を _ 連結した名前>.css` として `files` に追加
- `cssHrefs` には `{{ asset('css/common.css') }}` 形式を渡す
  （`renderer.js` の Step 1 で `escapeHtml(href)` すると `{{ }}` が壊れないことを確認する。
  Blade の `{{` は escapeHtml の対象文字を含まないのでそのまま通るが、テストで担保する）

#### Step 4: 設定 UI — チェックボックス追加

1. `index.html` のプロジェクト設定パネル（`pane-settings`）に追加する。

   ```html
   <label>
       <input type="checkbox" id="separate-css" onchange="updateSeparateCss()">
       CSSを別ファイルに出力する
   </label>
   ```

2. `ui/settings-ui.js` に反映処理を追加する（既存の `updateSiteSeo` 等と同じパターン）。

   ```js
   window.updateSeparateCss = () => {
       updateSettings({ separateCss: document.getElementById('separate-css').checked });
   };
   ```

   設定パネルへの値の反映（`refreshSettingsUI` 相当の関数）にもチェック状態の復元を追加する。

3. `project/project.js` の `createEmptyProject()` に既定値を追加する。

   ```js
   separateCss: false,
   ```

   `loadProject()` は settings をマージする実装であれば変更不要だが、
   古い project.json 読込時に `separateCss` が undefined → falsy で従来動作になることを確認する。

#### Step 5: テスト

`renderer.test.js` に追加:

- `cssHrefs` 指定時、HTML に `<link rel="stylesheet" href="css/index.css">` が含まれ、`<style id="dynamic-styles">` が**含まれない**こと
- `getExtractedCss()` の戻り値に `.site-canvas` と `.el-<id>` のルールが含まれること
- `cssHrefs` 未指定時は従来どおり `<style id="dynamic-styles">` が出ること（後方互換）

`exporter.test.js` に追加:

- `settings.separateCss: true` のプロジェクトで `css/common.css` と `css/index.css` が files に含まれること
- フォルダ内ページの HTML が `../css/` 参照になり、CSS 名が `<フォルダ名>_<ページ名>.css` になること
- `separateCss: false`（および未定義）のとき、出力 files が従来と同一であること
- Laravel 出力で `public/css/*.css` と `{{ asset('css/...') }}` 参照が出ること

#### Step 6: 動作確認

1. `npm test` が全件パスすること
2. `npm start` → 設定パネルにチェックボックスが表示されること
3. 分離 OFF で静的出力 → 従来どおり `<style>` 埋め込みの HTML が出ること
4. 分離 ON で静的出力 → `css/` フォルダ付きで出力され、`index.html` をブラウザで開いて表示・レスポンシブ切替（幅 768px 以下）・アニメーションが正常なこと
5. フォルダ内ページを作って出力し、`<フォルダ>/<ページ>.html` からも CSS が正しく当たること
6. プロジェクト保存 → 開き直しでチェック状態が復元されること
7. 旧バージョンで保存した project.json を開いてもエラーにならないこと

### 受け入れ条件

- [ ] 分離 OFF（既定）の出力が現状と 1 バイトも変わらない（既存テストがそのまま通る）
- [ ] 分離 ON で HTML から `<style>` 埋め込みが消え、`<link>` 参照 + CSS ファイル出力になる
- [ ] フォルダ内ページ・Laravel 出力・マルチページで正しく動く
- [ ] 上記のテストが追加され、`npm test` が通る

### 将来拡張（このフェーズではやらない）

- 要素タグ上の `style="..."`（インラインスタイル）もクラス化して CSS ファイルへ寄せる
  → 生成ロジック全体に手が入る大改修のため、分離出力が安定してから別途計画する
- 共通スタイルの重複検出（同一ルールの共通 CSS への昇格）

---

## 推奨着手順

1. **Phase 1**（テストが回る状態を作る。以降の変更の安全網）
2. **Phase 5: CSS分離生成**（テストで守りながら機能追加。ユーザー価値が最も直接的）
3. **Phase 2**（CDN 同梱 → CI → lint → CSP）
4. **Phase 3 → 4**（構造改善は単独 PR で少しずつ）
