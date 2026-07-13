import { describe, it, expect } from 'vitest';
import { buildStaticProject, buildLaravelProject } from './exporter.js';

const project = (overrides = {}) => ({
    settings: {
        projectName: 'my-site',
        canvas: { width: 800, height: 600, mobileWidth: 375, mobileHeight: 800 },
        outputType: 'static',
        siteBgColor: '#f1f2f6',
        seo: { siteName: '店', lang: 'ja', description: '共通説明', ogImage: '' },
    },
    folders: [],
    pages: [
        { id: 'page_1', name: 'index', folderId: null, bgColor: '#ffffff',
          seo: { title: 'トップ', description: '', ogImage: '' },
          elements: [
              { id: 'b1', type: 'Button', transform: { x: 0, y: 0, width: 100, height: 40 },
                properties: { text: '送信', role: 'submit', route: '' } },
              { id: 'ti', type: 'TextInput', transform: { x: 0, y: 50, width: 200, height: 40 },
                properties: { inputName: 'email', inputType: 'email' } },
          ] },
    ],
    activePageId: 'page_1',
    ...overrides,
});

describe('buildStaticProject', () => {
    it('index.html を生成し、解決済みSEOタイトル（ページ | サイト名）を含む', () => {
        const out = buildStaticProject(project());
        const idx = out.files.find(f => f.path === 'index.html');
        expect(idx).toBeTruthy();
        expect(idx.content).toContain('<title>トップ | 店</title>');
    });

    it('ページ説明が空ならサイト共通説明にフォールバックする', () => {
        const out = buildStaticProject(project());
        const idx = out.files.find(f => f.path === 'index.html');
        expect(idx.content).toContain('content="共通説明"');
    });

    it('ページ背景色を .site-canvas に反映する', () => {
        const out = buildStaticProject(project());
        const idx = out.files.find(f => f.path === 'index.html');
        expect(idx.content).toMatch(/\.site-canvas \{[^}]*background-color: #ffffff/);
    });
});

describe('buildLaravelProject', () => {
    it('送信ボタンがあると POST ルートと FormController を生成する', () => {
        const out = buildLaravelProject(project());
        const routes = out.files.find(f => f.path === 'routes/web.php');
        expect(routes.content).toContain("Route::post('/index-submit'");
        expect(out.files.some(f => f.path === 'app/Http/Controllers/FormController.php')).toBe(true);
    });

    it('Blade ビューに @csrf を含む', () => {
        const out = buildLaravelProject(project());
        const view = out.files.find(f => f.path === 'resources/views/index.blade.php');
        expect(view.content).toContain('@csrf');
    });
});

// フォルダ配下ページを持つプロジェクト
const foldered = (separateCss = true) => project({
    settings: {
        projectName: 'my-site',
        canvas: { width: 800, height: 600, mobileWidth: 375, mobileHeight: 800 },
        outputType: 'static',
        siteBgColor: '#f1f2f6',
        separateCss,
        seo: { siteName: '店', lang: 'ja', description: '共通説明', ogImage: '' },
    },
    folders: [{ id: 'f1', name: 'sub' }],
    pages: [
        { id: 'page_1', name: 'index', folderId: null, bgColor: '#ffffff',
          seo: { title: 'トップ', description: '', ogImage: '' },
          elements: [
              { id: 'lb', type: 'Label', transform: { x: 10, y: 20, width: 100, height: 30 },
                properties: { text: 'hi' } },
          ] },
        { id: 'page_2', name: 'about', folderId: 'f1', bgColor: '',
          seo: { title: 'about', description: '', ogImage: '' },
          elements: [] },
    ],
    activePageId: 'page_1',
});

describe('buildStaticProject CSS分離', () => {
    it('separateCss:false を明示すると css/ ファイルを一切出さず、HTMLに埋め込む', () => {
        const out = buildStaticProject(project());
        expect(out.files.some(f => f.path.startsWith('css/'))).toBe(false);
        const idx = out.files.find(f => f.path === 'index.html');
        expect(idx.content).toContain('<style id="dynamic-styles">');
    });

    it('separateCss:true で css/common.css とページ別CSSを出し、HTMLは <link> 参照になる', () => {
        const out = buildStaticProject(foldered());
        expect(out.files.some(f => f.path === 'css/common.css')).toBe(true);
        expect(out.files.some(f => f.path === 'css/index.css')).toBe(true);
        const idx = out.files.find(f => f.path === 'index.html');
        expect(idx.content).toContain('<link rel="stylesheet" href="css/common.css">');
        expect(idx.content).toContain('<link rel="stylesheet" href="css/index.css">');
        expect(idx.content).not.toContain('<style id="dynamic-styles">');
    });

    it('フォルダ内ページは ../css/ を相対参照し、CSS名は <フォルダ>_<ページ>.css になる', () => {
        const out = buildStaticProject(foldered());
        expect(out.files.some(f => f.path === 'css/sub_about.css')).toBe(true);
        const about = out.files.find(f => f.path === 'sub/about.html');
        expect(about.content).toContain('<link rel="stylesheet" href="../css/common.css">');
        expect(about.content).toContain('<link rel="stylesheet" href="../css/sub_about.css">');
    });

    it('ページ別CSSに .site-canvas と要素ルールを含む', () => {
        const out = buildStaticProject(foldered());
        const css = out.files.find(f => f.path === 'css/index.css');
        expect(css.content).toContain('.site-canvas {');
        expect(css.content).toContain('.el-lb {');
    });
});

describe('buildLaravelProject CSS分離', () => {
    it('separateCss:true で public/css/ にCSSを出し、Blade は {{ asset() }} 参照になる', () => {
        const out = buildLaravelProject(foldered());
        expect(out.files.some(f => f.path === 'public/css/common.css')).toBe(true);
        expect(out.files.some(f => f.path === 'public/css/index.css')).toBe(true);
        expect(out.files.some(f => f.path === 'public/css/sub_about.css')).toBe(true);
        const view = out.files.find(f => f.path === 'resources/views/index.blade.php');
        expect(view.content).toContain(`href="{{ asset('css/common.css') }}"`);
        expect(view.content).toContain(`href="{{ asset('css/index.css') }}"`);
    });
});
