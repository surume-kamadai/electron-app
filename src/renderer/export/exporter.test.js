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
