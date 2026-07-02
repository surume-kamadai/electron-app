// ============================================================
// exporter.js - シーンデータからプロジェクト一式を組み立てる
//
// 出力タイプ:
//   'static'  : さくら等にそのまま置けるHTML一式（index.html + images/）
//   'laravel' : Laravelプロジェクト構造（Blade + routes + public/images）
// ============================================================
import { HtmlRenderer } from './renderer.js';

// ページ＋サイト設定からSEOメタ情報を解決する
// （ページ個別が空ならサイト共通値にフォールバック）
function resolveSeo(project, page) {
    const site = project.settings?.seo || {};
    const pseo = page.seo || {};
    const baseTitle = (pseo.title && pseo.title.trim()) || page.name;
    const title = site.siteName ? `${baseTitle} | ${site.siteName}` : baseTitle;
    return {
        lang: site.lang || 'ja',
        title,
        description: (pseo.description && pseo.description.trim()) || site.description || '',
        ogImage: (pseo.ogImage && pseo.ogImage.trim()) || site.ogImage || '',
        siteName: site.siteName || '',
    };
}

// 要素ツリーから最初の送信ボタン(role==='submit')のプロパティを返す
function findSubmitButton(elements) {
    for (const el of (elements || [])) {
        const p = el.properties || {};
        if (p.visible === false) continue;
        if (el.type === 'Button' && p.role === 'submit') return p;
        if (Array.isArray(el.children)) {
            const f = findSubmitButton(el.children);
            if (f) return f;
        }
    }
    return null;
}

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
            elements: page.elements || [],
            seo: resolveSeo(project, page),
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
    const postRoutes = [];   // フォーム送信用 POST ルート

    for (const page of (project.pages || [])) {
        const bgColor = page.bgColor || project.settings?.siteBgColor || '#f1f2f6';

        const folderName = folderMap.get(page.folderId);
        const viewPathName = folderName ? `${folderName}/${page.name}` : page.name;

        // 送信ボタンがあれば、このページのフォーム action（POSTルート）を決める
        const submit = findSubmitButton(page.elements || []);
        let formAction = null;
        if (submit) {
            const userAction = (submit.route && submit.route !== '#') ? submit.route : '';
            formAction = userAction || `/${viewPathName}-submit`;
            postRoutes.push(formAction);
        }

        const sceneData = {
            canvas: project.settings?.canvas,
            bgColor: bgColor,
            elements: page.elements || [],
            seo: resolveSeo(project, page),
            formAction,
        };
        const renderer = new HtmlRenderer(sceneData, { mode: 'blade', imageMap: laravelImageMap });
        const blade = renderer.render();

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

    // フォーム送信のPOSTルートと、受け口コントローラの雛形を生成
    if (postRoutes.length > 0) {
        [...new Set(postRoutes)].forEach(action => {
            routes.push(`Route::post('${action}', [\\App\\Http\\Controllers\\FormController::class, 'handle']);`);
        });
        files.push({
            path: 'app/Http/Controllers/FormController.php',
            content: formControllerStub(),
        });
    }

    files.push({ path: 'routes/web.php', content: laravelRoutes(routes) });

    return {
        projectName: project.settings?.projectName || projectName,
        files,
        images: images.map(img => ({ path: `public/${img.path}`, dataUrl: img.dataUrl })),
    };
}

// フォーム受け口コントローラの雛形
function formControllerStub() {
    return [
        '<?php',
        '',
        'namespace App\\Http\\Controllers;',
        '',
        'use Illuminate\\Http\\Request;',
        '',
        'class FormController extends Controller',
        '{',
        '    public function handle(Request $request)',
        '    {',
        '        // 送信された全項目（入力欄の name 属性がキーになります）',
        '        $data = $request->all();',
        '',
        '        // TODO: バリデーション例',
        '        // $request->validate([',
        "        //     'email' => 'required|email',",
        '        // ]);',
        '',
        '        // TODO: メール送信例（config/mail.php 設定後）',
        '        // \\Mail::raw(print_r($data, true), function ($m) {',
        "        //     $m->to('you@example.com')->subject('お問い合わせ');",
        '        // });',
        '',
        "        return back()->with('success', '送信が完了しました。');",
        '    }',
        '}',
        '',
    ].join('\n');
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