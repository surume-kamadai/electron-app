// ============================================================
// migrate-structure.mjs
// Phase 1: src/renderer/editor/ のフラット構成を、責務ごとのフォルダ構成へ再配置する。
// ファイルは分割せず「移動のみ」。全JSの相対import指定子を新しい場所に合わせて書き換える。
//
// 使い方: リポジトリ直下で  node scripts/migrate-structure.mjs
// （2回目以降は移動済みファイルをスキップするので安全に再実行できる）
// ============================================================
import fs from 'fs';
import path from 'path';

const R = 'src/renderer';

// basename(拡張子なし) -> 新しい配置フォルダ（R からの相対）
const DIR = {
    // app
    'main-renderer': 'app', 'state': 'app',
    // canvas / 表示レイヤ
    'canvas': 'canvas', 'display': 'canvas', 'rulers': 'canvas',
    'canvas-preview': 'canvas', 'offscreen': 'canvas',
    'gradient-overlay': 'canvas', 'effect-overlay': 'canvas',
    // nodes（要素）
    'elements': 'nodes', 'warp': 'nodes', 'converter': 'nodes',
    // interaction
    'events': 'interaction',
    // inspector
    'inspector': 'inspector', 'interactions': 'inspector', 'slider-editor': 'inspector',
    'accordion-editor': 'inspector', 'image-picker': 'inspector',
    'color-picker': 'inspector', 'layer-style': 'inspector',
    // explorer
    'explorer': 'explorer', 'pages-ui': 'explorer',
    // history
    'history': 'history',
    // project / io
    'project': 'project', 'api': 'project',
    // export
    'renderer': 'export', 'exporter': 'export',
    // preview
    'preview': 'preview',
    // ui
    'toast': 'ui', 'dock-layout': 'ui', 'settings-ui': 'ui',
};

// テストも対象（対応する実装と同じフォルダへ）
const TEST_DIR = { 'renderer.test': 'export', 'exporter.test': 'export' };

// 現在の場所を探す（editor/ 直下か renderer/ 直下）
function findOld(base) {
    for (const p of [`${R}/editor/${base}.js`, `${R}/${base}.js`]) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

// 新しい場所（basename -> 絶対っぽい相対パス）
function newPathOf(base) {
    const dir = DIR[base] ?? TEST_DIR[base];
    return dir ? `${R}/${dir}/${base}.js` : null;
}

// 1) 物理移動
const allBases = [...Object.keys(DIR), ...Object.keys(TEST_DIR)];
for (const base of allBases) {
    const dest = newPathOf(base);
    const old = findOld(base);
    if (!old) continue;                         // 既に移動済み or 存在しない
    if (path.resolve(old) === path.resolve(dest)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(old, dest);
    console.log('moved', old, '->', dest);
}

// 2) import 指定子の書き換え（src/renderer 配下の全 .js を対象）
function listJs(dir) {
    const out = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) out.push(...listJs(p));
        else if (ent.name.endsWith('.js')) out.push(p);
    }
    return out;
}

// 指定子 -> 新しい相対パス（不明なものは null で「触らない」）
function resolveSpec(fromFile, spec) {
    if (!spec.startsWith('.')) return null;                    // 外部パッケージ
    let base = spec.split('/').pop().replace(/\.js$/, '');     // 末尾のファイル名
    let target = null;
    if (DIR[base]) target = `${R}/${DIR[base]}/${base}.js`;
    else if (TEST_DIR[base]) target = `${R}/${TEST_DIR[base]}/${base}.js`;
    else return null;                                          // 管理外は触らない
    let rel = path.relative(path.dirname(fromFile), target).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
}

const SPEC_RE = /(from\s*|import\s*)(['"])(\.[^'"]+)(['"])/g;
for (const file of listJs(R)) {
    let src = fs.readFileSync(file, 'utf8');
    let changed = false;
    src = src.replace(SPEC_RE, (m, kw, q1, spec, q2) => {
        const rel = resolveSpec(file, spec);
        if (!rel || rel === spec) return m;
        changed = true;
        return `${kw}${q1}${rel}${q2}`;
    });
    if (changed) { fs.writeFileSync(file, src); console.log('rewrote imports:', file); }
}

// 2.5) 先頭のパス見出しコメント（// src/renderer/editor/xxx.js）を新パスへ更新
for (const base of allBases) {
    const dest = newPathOf(base);
    if (!dest || !fs.existsSync(dest)) continue;
    let src = fs.readFileSync(dest, 'utf8');
    const nsrc = src.replace(`src/renderer/editor/${base}.js`, dest);
    if (nsrc !== src) { fs.writeFileSync(dest, nsrc); console.log('fixed header comment:', dest); }
}

// 3) index.html のエントリースクリプト参照を更新
const html = `${R}/index.html`;
if (fs.existsSync(html)) {
    let h = fs.readFileSync(html, 'utf8');
    const nh = h.replace(/(<script[^>]*src=")(?:\.\/)?main-renderer\.js(")/,
                         `$1app/main-renderer.js$2`);
    if (nh !== h) { fs.writeFileSync(html, nh); console.log('updated index.html script src'); }
}

console.log('done.');
