// ============================================================
// copy-vendor.mjs
// エディタが使う外部ライブラリを node_modules から
// src/renderer/vendor/ へコピーする。
// これにより CDN を使わずローカル同梱でオフライン起動でき、
// CSP を script-src 'self' に絞れる（＝リモートコード実行を遮断）。
//
// postinstall で自動実行される。node_modules が無い環境でも
// リポジトリに vendor/ をコミットしてあるのでアプリは動作する。
// ============================================================
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'src', 'renderer', 'vendor');

// [ node_modules 内のパス, vendor 内の出力名 ]
const files = [
    ['konva/konva.min.js',                         'konva.min.js'],
    ['jquery/dist/jquery.min.js',                  'jquery.min.js'],
    ['golden-layout/dist/goldenlayout.min.js',     'goldenlayout.min.js'],
    ['golden-layout/src/css/goldenlayout-base.css','goldenlayout-base.css'],
    ['golden-layout/src/css/goldenlayout-dark-theme.css', 'goldenlayout-dark-theme.css'],
    ['@simonwep/pickr/dist/pickr.min.js',          'pickr.min.js'],
    ['@simonwep/pickr/dist/themes/nano.min.css',   'pickr-nano.min.css'],
];

mkdirSync(vendor, { recursive: true });

let copied = 0, missing = 0;
for (const [src, out] of files) {
    const from = join(root, 'node_modules', src);
    if (!existsSync(from)) {
        console.warn(`[copy-vendor] スキップ（node_modules に無い）: ${src}`);
        missing++;
        continue;
    }
    copyFileSync(from, join(vendor, out));
    copied++;
}
console.log(`[copy-vendor] ${copied} ファイルを ${vendor} にコピー${missing ? `（${missing} 件スキップ）` : ''}`);
