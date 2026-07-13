# サードパーティ ライセンス表記

Site Builder は以下のオープンソースソフトウェアを利用しています。いずれも寛容な
ライセンス（MIT / SIL OFL）で再配布可能です。

## アプリに同梱（`src/renderer/vendor/`）

エディタ画面で使用。`scripts/copy-vendor.mjs` が `node_modules` から取得します。

| ライブラリ | バージョン | ライセンス | 著作権 |
|---|---|---|---|
| [Konva](https://konvajs.org/) | 9.x | MIT | © 2014–present Anton Lavrenov（原作 © 2011–2013 Eric Rowell） |
| [jQuery](https://jquery.com/) | 3.7.1 | MIT | © OpenJS Foundation and other contributors |
| [Golden Layout](https://goldenlayout.com/) | 1.5.9 | MIT | © 2016 deepstream.io |
| [Pickr](https://github.com/Simonwep/pickr) | 1.9.x | MIT | © 2018–2021 Simon Reinisch |

## 生成サイトが参照（アプリには非同梱・CDN経由）

出力した Web サイト側が読み込むもの。

| リソース | ライセンス | 用途 |
|---|---|---|
| [Swiper](https://swiperjs.com/) | MIT | 画像スライダーの動作（出力HTMLがCDNから読込） |
| [Google Fonts](https://fonts.google.com/)（Noto Sans/Serif JP, M PLUS Rounded 1c, Kosugi Maru, Sawarabi Mincho, Zen Maru Gothic, Yusei Magic, Dela Gothic One 等） | SIL Open Font License 1.1 | 日本語Webフォント |

---

各ライセンスの全文は、それぞれのプロジェクトの配布物および `node_modules/<パッケージ>/LICENSE`
を参照してください（MIT ライセンスは本リポジトリの `LICENSE` と同一の許諾条件です）。
