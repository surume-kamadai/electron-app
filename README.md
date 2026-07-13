# Site Builder（Electron版）

GUIでWebサイトをデザインし、静的HTML または Laravel Blade を出力するデスクトップアプリです。
PHPやNode.jsのサーバーは不要。アプリ単体で動作します。

## 開発時の起動

```bash
cd electron-app
npm install      # 初回のみ（electron をダウンロード）
npm start        # アプリ起動
npm run dev      # 開発者ツール付きで起動
```

## 配布用ビルド

```bash
npm run build        # 現在のOS向け
npm run build:win    # Windows用 .exe
npm run build:mac    # Mac用 .dmg
```

`dist/` フォルダに成果物が出ます。

## 使い方

1. 左のツールパネルから要素（ボタン・入力欄・テキスト・図形）を追加。
2. 画像はPCから直接ドラッグ＆ドロップ。
3. 右のプロパティパネルで位置・色・テキスト等を編集。
4. 出力する。

### 出力タイプ

- 「🌐 静的サイト出力」… `index.html` ＋ `images/` を出力。
  さくらレンタルサーバー等にFTPで置けばそのまま公開可能。
  ボタンのリンク先にGoogleフォームのURLを設定しておけば、
  フォーム送信→スプレッドシート→GASで自動メール、という構成が組める。

- 「⚙️ Laravel出力」… `resources/views/index.blade.php` ＋ `routes/web.php`
  ＋ `public/images/` を出力。既存のLaravelプロジェクトに組み込める。

### お問い合わせフォームの設計（静的サイトの場合）

```
お問い合わせボタン（リンク先にGoogleフォームURLを設定）
   ↓
Googleフォーム
   ↓
スプレッドシート（回答が自動で蓄積）
   ↓
GAS（フォーム送信トリガー）
   ↓
担当者へ自動メール（件名に氏名を差し込み）
```

## 開発・テスト

```bash
npm test         # 出力エンジンのユニットテスト（vitest）
npm run test:watch
```

## 構成

```
electron-app/
├── package.json
└── src/
    ├── main/
    │   ├── main.js          メインプロセス（ウィンドウ＋ファイル操作IPC）
    │   └── preload.js       安全なAPI橋渡し
    └── renderer/
        ├── index.html       エディタ画面
        ├── editor.css       スタイル
        ├── app/             エントリーポイント・共有ステート
        ├── canvas/          Konvaキャンバス・ルーラー・オーバーレイ
        ├── nodes/           要素定義・スタイル・変換
        ├── inspector/       プロパティパネル各種エディタ
        ├── interaction/     イベント・クリップボード・テキスト編集
        ├── history/         Undo/Redo（ページ単位）
        ├── explorer/        レイヤー/ページ一覧UI
        ├── project/         プロジェクト・ページ管理・出力API
        ├── export/          HTML/CSS生成エンジン（static/blade両対応）
        ├── preview/         プレビュー
        ├── ui/              ドックレイアウト・設定UI・トースト
        └── utils/           色などの共通ヘルパー
```
