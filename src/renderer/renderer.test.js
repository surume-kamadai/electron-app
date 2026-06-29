import { describe, it, expect } from 'vitest';
import { HtmlRenderer } from '../src/renderer/renderer.js';

function render(scene, mode = 'static') {
    return new HtmlRenderer(scene, { mode, imageMap: new Map() }).render();
}

const base = (overrides = {}) => ({
    canvas: { width: 800, height: 600, mobileWidth: 375, mobileHeight: 800 },
    bgColor: '#ffcc00',
    seo: { lang: 'ja', title: 'テストページ', description: '説明', ogImage: 'https://x/og.png', siteName: '店' },
    elements: [],
    ...overrides,
});

describe('HtmlRenderer SEO', () => {
    it('title / description / OGP / lang を出力する', () => {
        const h = render(base());
        expect(h).toContain('<html lang="ja">');
        expect(h).toContain('<title>テストページ</title>');
        expect(h).toContain('<meta name="description" content="説明">');
        expect(h).toContain('property="og:title" content="テストページ"');
        expect(h).toContain('property="og:image" content="https://x/og.png"');
        expect(h).toContain('name="twitter:card" content="summary_large_image"');
    });

    it('SEO値のHTMLをエスケープする', () => {
        const h = render(base({ seo: { title: '<x>"&' } }));
        expect(h).toContain('<title>&lt;x&gt;&quot;&amp;</title>');
    });
});

describe('HtmlRenderer 背景色', () => {
    it('.site-canvas と body の両方に bgColor を適用する', () => {
        const h = render(base());
        expect(h).toMatch(/\.site-canvas \{[^}]*background-color: #ffcc00/);
        expect(h).toContain('<body style="margin: 0; background-color: #ffcc00;">');
    });
});

const formScene = (extra = {}) => base({
    elements: [
        { id: 'ti1', type: 'TextInput', transform: { x: 0, y: 0, width: 200, height: 40 },
          properties: { inputName: 'email', inputType: 'email', required: true, text: 'メール' } },
        { id: 'ta1', type: 'TextInput', transform: { x: 0, y: 60, width: 200, height: 80 },
          properties: { inputName: 'msg', inputType: 'textarea', text: '本文' } },
        { id: 'b1', type: 'Button', transform: { x: 0, y: 160, width: 120, height: 40 },
          properties: { text: '送信', role: 'submit', route: 'https://formspree.io/f/x', method: 'POST', ...extra } },
        { id: 'b2', type: 'Button', transform: { x: 140, y: 160, width: 80, height: 40 },
          properties: { text: '戻る', role: 'link', route: 'index.html' } },
    ],
});

describe('HtmlRenderer フォーム', () => {
    it('送信ボタンがあるとページを <form> でラップし、入力欄に name/type/required を出す', () => {
        const h = render(formScene());
        expect(h).toContain('<form action="https://formspree.io/f/x"');
        expect(h).toContain('<button type="submit"');
        expect(h).toContain('name="email"');
        expect(h).toContain('type="email"');
        expect(h).toContain('required');
        expect(h).toContain('<textarea');
        expect(h).toContain('name="msg"');
    });

    it('リンクボタンは <a> として出力され submit にならない', () => {
        const h = render(formScene());
        expect(h).toContain('href="index.html"');
    });

    it('既定では送信完了オーバーレイ（隠しiframe方式）を出力する', () => {
        const h = render(formScene());
        expect(h).toContain('id="ksb-form-success"');
        expect(h).toContain('name="ksb_form_target"');
        expect(h).toContain('送信ありがとうございました。');
    });

    it('完了メッセージが空なら遷移のみ（オーバーレイ/iframe なし）', () => {
        const h = render(formScene({ successMessage: '' }));
        expect(h).not.toContain('ksb-form-success');
        expect(h).not.toContain('ksb_form_target');
    });

    it('Bladeモードでは @csrf と session(success) を出力する', () => {
        const h = new HtmlRenderer({ ...formScene(), formAction: '/contact-submit' },
            { mode: 'blade', imageMap: new Map() }).render();
        expect(h).toContain('@csrf');
        expect(h).toContain('action="/contact-submit"');
        expect(h).toContain("@if(session('success'))");
    });

    it('送信ボタンが無ければ <form> を出さない', () => {
        const h = render(base({ elements: [
            { id: 'l', type: 'Label', transform: { x: 0, y: 0, width: 100, height: 20 }, properties: { text: 'hi' } },
        ] }));
        expect(h).not.toContain('<form');
    });
});
