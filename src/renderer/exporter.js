// ============================================================
// exporter.js - シーンデータからプロジェクト一式を組み立てる
//
// 出力タイプ:
//   'static'  : さくら等にそのまま置けるHTML一式（index.html + images/）
//   'laravel' : Laravelプロジェクト構造（Blade + routes + public/images）
// ============================================================
import { HtmlRenderer } from './renderer.js';

// 全ページの要素からBase64画像を集めてパスを割り当てる
function collectImages(project) {
    const imageMap = new Map();
    const images   = [];
    let counter = 0;

    function walk(elements) {
        for (const el of elements) {
            if (el.type === 'Image' && typeof el.properties.text === 'string'
                && el.properties.text.startsWith('data:image')) {
                const dataUrl = el.properties.text;
                if (!imageMap.has(dataUrl)) {
                    counter++;
                    const ext  = (dataUrl.match(/^data:image\/(\w+)/)?.[1] || 'png').replace('jpeg', 'jpg');
                    const path = `images/img_${counter}.${ext}`;
                    imageMap.set(dataUrl, path);
                    images.push({ path, dataUrl });
                }
            }
            if (Array.isArray(el.children)) walk(el.children);
        }
    }

    // 全ページを走査
    const pages = project.pages || [];
    for (const page of pages) {
        walk(page.elements || []);
    }

    return { imageMap, images };
}

// 静的サイト用の出力（マルチページ・フォルダ対応）
export function buildStaticProject(project, projectName = 'my-site') {
    const { imageMap, images } = collectImages(project);
    const folderMap = new Map((project.folders || []).map(f => [f.id, f.name]));
    
    const files = [
        { path: 'README.txt', content: staticReadme() },
    ];

    for (const page of (project.pages || [])) {
        // HtmlRenderer に渡すための単一ページ用ダミーシーンを構築
        const bgColor = page.bgColor || project.settings?.siteBgColor || '#f1f2f6';
        const sceneData = {
            canvas: project.settings?.canvas,
            bgColor: bgColor,
            elements: page.elements || []
        };
        const renderer = new HtmlRenderer(sceneData, { mode: 'static', imageMap });
        const html = renderer.render();

        // フォルダ名があれば付与
        const folderName = folderMap.get(page.folderId);
        const filePath = folderName ? `${folderName}/${page.name}.html` : `${page.name}.html`;

        files.push({ path: filePath, content: html });
    }

    return {
        projectName: project.settings?.projectName || projectName,
        files,
        images: images.map(img => ({ path: img.path, dataUrl: img.dataUrl })),
    };
}

// Laravelプロジェクト用の出力（マルチページ・フォルダ対応）
export function buildLaravelProject(project, projectName = 'my-laravel-site') {
    const { imageMap, images } = collectImages(project);

    // 画像パスのLaravel用変換
    const laravelImageMap = new Map();
    for (const [dataUrl, relPath] of imageMap) {
        laravelImageMap.set(dataUrl, `{{ asset('${relPath}') }}`);
    }

    const folderMap = new Map((project.folders || []).map(f => [f.id, f.name]));
    const files = [
        { path: 'README.txt', content: laravelReadme() },
    ];
    const routes = [];

    for (const page of (project.pages || [])) {
        const bgColor = page.bgColor || project.settings?.siteBgColor || '#f1f2f6';
        const sceneData = {
            canvas: project.settings?.canvas,
            bgColor: bgColor,
            elements: page.elements || []
        };
        const renderer = new HtmlRenderer(sceneData, { mode: 'blade', imageMap: laravelImageMap });
        const blade = renderer.render();

        const folderName = folderMap.get(page.folderId);
        const viewPathName = folderName ? `${folderName}/${page.name}` : page.name;
        
        // Bladeファイルの出力パス
        files.push({ 
            path: `resources/views/${viewPathName}.blade.php`, 
            content: blade 
        });

        // route用のパス定義 (indexの場合は / にする)
        const urlPath = viewPathName === 'index' ? '/' : `/${viewPathName}`;
        const viewDotName = folderName ? `${folderName}.${page.name}` : page.name;
        routes.push(`Route::get('${urlPath}', fn() => view('${viewDotName}'));`);
    }

    files.push({ path: 'routes/web.php', content: laravelRoutes(routes) });

    return {
        projectName: project.settings?.projectName || projectName,
        files,
        images: images.map(img => ({ path: `public/${img.path}`, dataUrl: img.dataUrl })),
    };
}

// --- 付属ファイルの中身 ---

function staticReadme() {
    return [
        'さくらレンタルサーバー等への設置手順',
        '================================',
        '',
        '1. このフォルダの中身（.htmlファイルと images/）を',
        '   FTPソフト（FileZilla等）でサーバーの www/ 等にアップロードする。',
        '',
        '2. ブラウザで https://あなたのドメイン/ を開いて確認する。',
        '',
    ].join('\n');
}

function laravelRoutes(routeLines) {
    return [
        '<?php',
        '',
        'use Illuminate\\Support\\Facades\\Route;',
        '',
        ...routeLines,
        '',
    ].join('\n');
}

function laravelReadme() {
    return [
        'Laravelプロジェクトへの組み込み手順',
        '================================',
        '',
        '1. resources/views/ 内のファイルを既存のLaravelプロジェクトにコピー。',
        '2. routes/web.php のルート定義を追記。',
        '3. public/images/ の画像をコピー。',
        '4. php artisan serve で確認。',
        '',
    ].join('\n');
}