// ============================================================
// renderer.js - HTML生成エンジン（レスポンシブ＆インタラクション拡張版）
// ============================================================

const ANIM_CSS = `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideLeft { from { opacity: 0; transform: translateX(50px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideRight { from { opacity: 0; transform: translateX(-50px); } to { opacity: 1; transform: translateX(0); } }
        .anim-fadein    { animation: fadeIn    1s   cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-fadeup    { animation: fadeUp    1s   cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-scale     { animation: scaleIn   0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-slideleft { animation: slideLeft  0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-slideright{ animation: slideRight 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }`;

// HTML特殊文字をエスケープ
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function resolveImageSrc(src, imageMap) {
    if (typeof src === 'string' && src.startsWith('data:image')) {
        return imageMap.get(src) || src;
    }
    return src;
}

export class HtmlRenderer {
    constructor(sceneData, options = {}) {
        this.scene    = sceneData;
        this.mode     = options.mode || 'static';
        this.imageMap = options.imageMap || new Map();
        
        // ▼ 追加: レスポンシブ用CSSとイベント用JSを蓄積するバッファ
        this.dynamicCss = [];
        this.dynamicJs  = [];
        this._mobileW = 375;
        this._mobileCanvasH = 800;
    }

render() {
        const cw = this.scene.canvas?.width  ?? 800;
        const ch = this.scene.canvas?.height ?? 600;

        this._mobileW = this.scene.canvas?.mobileWidth  ?? 375;
        this._mobileCanvasH = this.scene.canvas?.mobileHeight ?? 800;

        const elementsHtml = this.renderElements(this.scene.elements || [], cw, ch, 1);

        this.dynamicCss.push(
            `.site-canvas { position: relative; width: 100%; max-width: ${cw}px; aspect-ratio: ${cw} / ${ch}; background-color: #ffffff; box-shadow: 0 0 30px rgba(0,0,0,0.1); overflow: hidden; margin: 0 auto; transition: all 0.3s ease; }`
        );
        this.dynamicCss.push(
            `@media (max-width: 768px) { .site-canvas { max-width: 100%; aspect-ratio: ${this._mobileW} / ${this._mobileCanvasH}; } }`
        );

        const cssString = this.dynamicCss.join('\n    ');

        let jsString = '';
        if (this.dynamicJs.length > 0) {
            jsString = `\n<script>\ndocument.addEventListener("DOMContentLoaded", function() {\n    ${this.dynamicJs.join('\n    ')}\n});\n</script>\n`;
        }

        // ▼▼ SEO メタタグの構築 ▼▼
        const seo   = this.scene.seo || {};
        const lang  = escapeHtml(seo.lang || 'ja');
        const title = escapeHtml(seo.title || 'ページ');

        let html  = `<!DOCTYPE html>\n<html lang="${lang}">\n<head>\n`;
        html += '    <meta charset="UTF-8">\n';
        html += '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
        html += `    <title>${title}</title>\n`;
        if (seo.description) {
            html += `    <meta name="description" content="${escapeHtml(seo.description)}">\n`;
        }
        // OGP / Twitter カード
        html += '    <meta property="og:type" content="website">\n';
        html += `    <meta property="og:title" content="${title}">\n`;
        if (seo.description) html += `    <meta property="og:description" content="${escapeHtml(seo.description)}">\n`;
        if (seo.ogImage)     html += `    <meta property="og:image" content="${escapeHtml(seo.ogImage)}">\n`;
        if (seo.siteName)    html += `    <meta property="og:site_name" content="${escapeHtml(seo.siteName)}">\n`;
        html += `    <meta name="twitter:card" content="${seo.ogImage ? 'summary_large_image' : 'summary'}">\n`;
        // ▲▲ SEO メタタグ構築ここまで ▲▲

        html += '    <style>\n' + ANIM_CSS + '\n    </style>\n';
        html += '    <style id="dynamic-styles">\n    ' + cssString + '\n    </style>\n';
        
        // ▼▼ 追加: スライダーがあればSwiperのCSSを読み込む ▼▼
        if (elementsHtml.includes('class="swiper')) {
            html += '    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css" />\n';
            // Swiperのデフォルトの矢印/ドットの色を白や任意の色に変えたい場合のスタイル補正
            html += '    <style>:root { --swiper-theme-color: #ffffff; }</style>\n';
        }

        const bgColor = this.scene.bgColor || '#f1f2f6';
        html += `</head>\n<body style="margin: 0; background-color: ${bgColor};">\n\n`;
        
        // ▼▼ フォーム: 送信ボタンがあればページ全体を <form> でラップ ▼▼
        const submit = this._findSubmitButton(this.scene.elements || []);
        let formOpen = '', formClose = '';
        if (submit) {
            const userAction = (submit.route && submit.route !== '#') ? submit.route : '';
            if (this.mode === 'blade') {
                // Laravel: exporter が決めた action を優先、無ければ /contact
                const action = escapeHtml(this.scene.formAction || userAction || '/contact');
                formOpen  = `<form action="${action}" method="POST">\n@csrf`;
                formClose = `</form>`;
            } else {
                // 静的: Googleフォーム/Formspree 等のエンドポイントへ送信
                const action = escapeHtml(userAction || '#');
                const method = (submit.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
                formOpen  = `<form action="${action}" method="${method}">`;
                formClose = `</form>`;
            }
        }

        html += `<div class="site-canvas">\n`;
        if (formOpen)  html += formOpen + '\n';
        html += elementsHtml;
        if (formClose) html += formClose + '\n';
        html += '\n</div>\n';
        
        // ▼▼ 追加: スライダーがあればSwiperのJS本体を読み込む ▼▼
        if (elementsHtml.includes('class="swiper')) {
            html += '<script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>\n';
        }
        
        html += jsString;
        html += '\n</body>\n</html>';

        return html;
    }

    // 要素ツリーを再帰的にたどり、最初の「送信ボタン」(role==='submit')の
    // プロパティを返す。無ければ null。
    _findSubmitButton(elements) {
        for (const el of (elements || [])) {
            const p = el.properties || {};
            if (p.visible === false) continue;
            if (el.type === 'Button' && p.role === 'submit') return p;
            if (Array.isArray(el.children)) {
                const found = this._findSubmitButton(el.children);
                if (found) return found;
            }
        }
        return null;
    }

    renderElements(elements, parentW, parentH, depth) {
        let out = '';
        const indent = '    '.repeat(depth);

        for (const el of (elements || [])) {
            const id    = el.id;
            const type  = el.type;
            const props = el.properties || {};

            if (props.visible === false) continue;

            // ▼▼ レスポンシブ座標の抽出とCSS構築（方針A: transformを正とする）▼▼
            // PC配置は常に transform（正しい左上座標）を使う
            const tf = el.transform || { x: 0, y: 0, width: 100, height: 50 };
            const pcW = tf.width;
            const pcH = tf.height;

            // PC用パーセント座標計算
            const leftPc = parentW > 0 ? (tf.x / parentW) * 100 : 0;
            const topPc  = parentH > 0 ? (tf.y / parentH) * 100 : 0;
            const wPc    = parentW > 0 ? (pcW / parentW) * 100 : 0;
            const hPc    = parentH > 0 ? (pcH / parentH) * 100 : 0;
            const fontPc = props.fontsize || 16;

            // スマホ用：mobileEdited が true の要素だけ mobile レイアウトで上書き。
            // それ以外は PC のパーセント値をそのまま使う（相対配置を維持）。
            let leftMo = leftPc, topMo = topPc, wMo = wPc, hMo = hPc, fontMo = fontPc;
            if (props.mobileEdited && props.layouts?.mobile) {
                const lMo = props.layouts.mobile;
                const canvasW = this.scene.canvas?.width  || 800;
                const canvasH = this.scene.canvas?.height || 600;
                const parentMoW = (parentW === canvasW) ? this._mobileW : parentW;
                const parentMoH = (parentH === canvasH) ? this._mobileCanvasH : parentH;
                leftMo = parentMoW > 0 ? (lMo.x / parentMoW) * 100 : leftPc;
                topMo  = parentMoH > 0 ? (lMo.y / parentMoH) * 100 : topPc;
                wMo    = parentMoW > 0 ? (lMo.w / parentMoW) * 100 : wPc;
                hMo    = parentMoH > 0 ? (lMo.h / parentMoH) * 100 : hPc;
                fontMo = lMo.fontsize || fontPc;
            }

            // IDごとのCSSクラスを生成
            const className = `el-${id}`;

            // PC用スタイル (デフォルト)
            // ArticleGrid は中身に応じて高さを伸ばす（固定高さだとカードが潰れる）
            const heightRule = (type === 'ArticleGrid' || type === 'Accordion')
                ? `height: auto; min-height: ${hPc}%`
                : `height: ${hPc}%`;
            let cssRule = `.${className} { left: ${leftPc}%; top: ${topPc}%; width: ${wPc}%; ${heightRule}; font-size: ${fontPc}px; transition: all 0.3s ease; }`;

            // スマホ: font-size を vw 基準にして、画面幅に応じて文字も拡縮させる
            const fontMoVw = (fontMo / this._mobileW * 100).toFixed(2);
            const heightRuleMo = (type === 'ArticleGrid' || type === 'Accordion')
                ? `height: auto`
                : `height: ${hMo}%`;
            cssRule += `\n    @media (max-width: 768px) { .${className} { left: ${leftMo}%; top: ${topMo}%; width: ${wMo}%; ${heightRuleMo}; font-size: ${fontMoVw}vw; } }`;
            
            this.dynamicCss.push(cssRule);
            // ▲▲ レスポンシブCSS構築ここまで ▲▲

            // ▼▼ イベント(JS)の構築 ▼▼
            if (props.events && props.events.length > 0) {
                props.events.forEach(ev => {
                    const eventName = ev.trigger === 'hover' ? 'mouseenter' : 'click';
                    let actionJs = '';
                    
                    if (ev.action === 'alert') {
                        const safeMsg = (ev.target || '').replace(/"/g, '\\"');
                        actionJs = `alert("${safeMsg}");`;
                    } else if (ev.target) { // ID指定のターゲット操作
                        actionJs = `
            var t = document.getElementById("${ev.target}");
            if (t) {
                ${ev.action === 'show' ? 't.style.display = "block";' : ''}
                ${ev.action === 'hide' ? 't.style.display = "none";' : ''}
                ${ev.action === 'toggle' ? 't.style.display = (t.style.display === "none" ? "block" : "none");' : ''}
            }`;
                    }

                    if (actionJs) {
                        this.dynamicJs.push(`
    var el_${id} = document.getElementById("${id}");
    if (el_${id}) {
        el_${id}.addEventListener("${eventName}", function(e) {
            e.preventDefault();
            ${actionJs}
        });
    }`);
                    }
                });
            }
            // ▲▲ イベント(JS)構築ここまで ▲▲

            // 共通プロパティの展開
            const text     = escapeHtml(props.text ?? '');
            const name     = escapeHtml(props.name ?? 'Unnamed');
            const bgcolor  = escapeHtml(props.bgcolor ?? 'transparent');
            const color    = escapeHtml(props.color ?? 'inherit');
            const align    = escapeHtml(props.align || (type === 'Button' ? 'center' : 'left'));
            const fontfam  = escapeHtml(props.fontfamily || 'sans-serif');

            let animClass = className; // レスポンシブ用クラスを割り当て
            if (props.animation && props.animation !== 'none') {
                animClass += ' anim-' + String(props.animation).toLowerCase();
            }

            const shadow = props.shadow || 'none';
            let shadowStyle = '';
            if (shadow === 'light') {
                shadowStyle = type === 'Label' ? 'text-shadow: 0 4px 10px rgba(0,0,0,0.15);' : 'box-shadow: 0 4px 10px rgba(0,0,0,0.15);';
            } else if (shadow === 'dark') {
                shadowStyle = type === 'Label' ? 'text-shadow: 0 8px 15px rgba(0,0,0,0.4);' : 'box-shadow: 0 8px 15px rgba(0,0,0,0.4);';
            }

            // width等を除いたベーススタイル
            let baseStyle = `position: absolute; box-sizing: border-box;`;
            // Group / ArticleGrid / Accordion は自前でレイアウトを組むので baseStyle に背景を付けない
            if (type !== 'Group' && type !== 'ArticleGrid' && type !== 'Accordion') {
                baseStyle += ` background-color: ${bgcolor}; color: ${color}; text-align: ${align}; font-family: ${fontfam};`;
                if (type !== 'Button' && type !== 'Image') baseStyle += ` ${shadowStyle}`; 
            }

            out += `${indent}\n`;

            switch (type) {
                case 'Group':
                    out += this.renderGroup(id, animClass, baseStyle, bgcolor, el, pcW, pcH, depth, indent);
                    break;
                case 'Button':
                    out += this.renderButton(id, animClass, baseStyle, bgcolor, color, text, props, shadowStyle, indent);
                    break;
                case 'TextInput':
                    out += this.renderTextInput(id, animClass, baseStyle, text, props, indent);
                    break;
                case 'Label':
                    out += this.renderLabel(id, animClass, baseStyle, color, text, props, shadowStyle, indent);
                    break;
                case 'Rect':
                    out += `${indent}<div id="${id}" class="${animClass}" style="${baseStyle}"></div>\n`;
                    break;
                case 'Circle':
                    out += `${indent}<div id="${id}" class="${animClass}" style="${baseStyle} border-radius: 50%;"></div>\n`;
                    break;
                case 'Warp': {
                    const pts = props.warpPoints || [];
                    if (pts.length >= 3) {
                        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
                        const minX = Math.min(...xs), minY = Math.min(...ys);
                        const bw = Math.max(...xs) - minX || 1;
                        const bh = Math.max(...ys) - minY || 1;
                        const poly = pts.map(p =>
                            `${(((p.x - minX) / bw) * 100).toFixed(2)}% ${(((p.y - minY) / bh) * 100).toFixed(2)}%`
                        ).join(', ');
                        const warpStyle = `position: absolute; left: ${leftPc}%; top: ${topPc}%; width: ${wPc}%; height: ${hPc}%; background-color: ${bgcolor}; clip-path: polygon(${poly}); ${shadowStyle}`;
                        out += `${indent}<div id="${id}" class="${animClass}" style="${warpStyle}"></div>\n`;
                    } else {
                        out += `${indent}<div id="${id}" class="${animClass}" style="${baseStyle}"></div>\n`;
                    }
                    break;
                }
                case 'Triangle':
                    const triStyle = `position: absolute; width: 100%; height: 100%; box-sizing: border-box; clip-path: polygon(50% 0%, 0% 100%, 100% 100%); background-color: ${bgcolor};`;
                    out += `${indent}<div id="${id}" class="${animClass}"><div style="${triStyle}"></div></div>\n`;
                    break;
                case 'Image':
                    out += this.renderImage(id, animClass, baseStyle, props, name, shadowStyle, indent);
                    break;
                case 'Slider':
                out += this.renderSlider(id, animClass, baseStyle, props, indent);
                break;
                case 'ArticleGrid':
                out += this.renderArticleGrid(id, animClass, baseStyle, props, indent);
                break;
                case 'Accordion':
                out += this.renderAccordion(id, animClass, baseStyle, props, indent);
                break;
            }
        }
        return out;
    }

    renderGroup(id, animClass, baseStyle, bgcolor, el, width, height, depth, indent) {
        let out = `${indent}<div id="${id}" class="${animClass}" style="${baseStyle} background-color: ${bgcolor};">\n`;
        if (Array.isArray(el.children)) {
            out += this.renderElements(el.children, width, height, depth + 1);
        }
        out += `${indent}</div>\n`;
        return out;
    }

    renderButton(id, animClass, baseStyle, bgcolor, color, text, props, shadowStyle, indent) {
        let bgStyle = `background-color: ${bgcolor};`;
        if (props.bgimage) {
            const src = escapeHtml(resolveImageSrc(props.bgimage, this.imageMap));
            bgStyle = `background-image: url('${src}'); background-size: cover; background-position: center;`;
        }

        const btnStyle = `width: 100%; height: 100%; box-sizing: border-box; ${bgStyle} color: ${color}; font-size: inherit; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; ${shadowStyle}`;
        const formStyle = `margin: 0; position: absolute; width: 100%; height: 100%;`;

        // 送信ボタン: ページ全体を包む <form>（render側で出力）が送信を担うので
        // ここでは type="submit" のボタンを置くだけ。リンクや内部フォームは付けない。
        if (props.role === 'submit') {
            let out = `${indent}<div id="${id}" class="${animClass}" style="${baseStyle} background:none;">\n`;
            out += `${indent}    <button type="submit" style="${btnStyle} ${formStyle}">${text}</button>\n`;
            out += `${indent}</div>\n`;
            return out;
        }

        // 通常ボタン: 静的・Blade とも <a> リンクとして出力する
        const url = escapeHtml(props.route && props.route !== '#' ? props.route : '#');
        let out = `${indent}<div id="${id}" class="${animClass}" style="${baseStyle} background:none;">\n`;
        out += `${indent}    <a href="${url}" style="${formStyle} display:block; text-decoration:none;">\n`;
        out += `${indent}        <button type="button" style="${btnStyle}">${text}</button>\n`;
        out += `${indent}    </a>\n`;
        out += `${indent}</div>\n`;
        return out;
    }

    renderTextInput(id, animClass, baseStyle, text, props, indent) {
        // フォーム項目として name / 種類 / 必須 を反映する
        const name      = escapeHtml(props.inputName || '');
        const nameAttr  = name ? ` name="${name}"` : '';
        const required  = props.required ? ' required' : '';
        const ph        = escapeHtml(text || '');
        // 入力タイプは想定値のみ許可（安全側）
        const allowed   = ['text', 'email', 'tel', 'number'];
        const rawType   = props.inputType || 'text';

        if (rawType === 'textarea') {
            const style = baseStyle + ' padding: 10px; border: 1px solid #ccc; border-radius: 4px; background-color: #fff; width: 100%; height: 100%; resize: none; font-family: inherit;';
            return `${indent}<div id="${id}" class="${animClass}" style="position:absolute;"><textarea${nameAttr} placeholder="${ph}"${required} style="${style}"></textarea></div>\n`;
        }

        const itype = allowed.includes(rawType) ? rawType : 'text';
        const style = baseStyle + ' padding: 10px; border: 1px solid #ccc; border-radius: 4px; background-color: #fff; width: 100%; height: 100%;';
        return `${indent}<div id="${id}" class="${animClass}" style="position:absolute;"><input type="${itype}"${nameAttr} placeholder="${ph}"${required} style="${style}"></div>\n`;
    }

    renderLabel(id, animClass, baseStyle, color, text, props, shadowStyle, indent) {
        const style = `${baseStyle} display: block; overflow: hidden; ${shadowStyle}`;
        return `${indent}<div id="${id}" class="${animClass}" style="${style}">${text}</div>\n`;
    }

    renderImage(id, animClass, baseStyle, props, name, shadowStyle, indent) {
        const src = escapeHtml(resolveImageSrc(props.text, this.imageMap));
        const route = props.route ?? '#';
        const hasLink = route !== '#' && route !== '' && route !== 'none';
        const imgStyle = `width: 100%; height: 100%; object-fit: cover; display: block; ${shadowStyle}`;

        if (hasLink) {
            const url = escapeHtml(route);
            let out = `${indent}<div id="${id}" class="${animClass}" style="${baseStyle} background:none;">\n`;
            out += `${indent}    <a href="${url}" style="display:block; width:100%; height:100%;">\n`;
            out += `${indent}        <img src="${src}" alt="${name}" style="${imgStyle}">\n`;
            out += `${indent}    </a>\n`;
            out += `${indent}</div>\n`;
            return out;
        }

        return `${indent}<img id="${id}" src="${src}" alt="${name}" class="${animClass}" style="${baseStyle} ${imgStyle}">\n`;
    }
    renderSlider(id, animClass, baseStyle, props, indent) {
        // 新スキーマ slides[] 優先、無ければ旧 text(カンマ区切り画像URL)から変換
        let slides = props.slider?.slides;
        if (!Array.isArray(slides) || slides.length === 0) {
            const legacy = (props.text || '').split(',').map(s => s.trim()).filter(Boolean);
            slides = legacy.map(url => ({ image: url, title: '', text: '', linkType: 'none', link: '' }));
        }

        if (slides.length === 0) {
            return `${indent}<div id="${id}" style="${baseStyle} background:#333; color:#fff; display:flex; align-items:center; justify-content:center;">スライドが設定されていません</div>\n`;
        }

        const s = props.slider || {};
        const effect       = s.effect ?? 'slide';
        const speed        = s.speed ?? 600;
        const autoplay     = s.autoplay ?? true;
        const delay        = s.delay ?? 3000;
        const loop         = s.loop ?? true;
        const pagination   = s.pagination ?? true;
        const navigation   = s.navigation ?? true;
        const slidesPerView = s.slidesPerView ?? 1;

        const useGrid  = effect === 'grid';
        const useCards = effect === 'cards';
        const useCover = effect === 'coverflow';
        const useCube  = effect === 'cube';
        const useFade  = effect === 'fade';

        // Swiperのエフェクト名（grid は slide扱い + slidesPerView複数）
        const swiperEffect = useGrid ? 'slide' : effect;

        let out = `${indent}<div id="${id}" class="swiper ${animClass}" style="${baseStyle} border-radius: 5px; overflow:hidden;">\n`;
        out += `${indent}    <div class="swiper-wrapper">\n`;

        slides.forEach((sl) => {
            const img = sl.image ? escapeHtml(resolveImageSrc(sl.image, this.imageMap)) : '';
            const title = escapeHtml(sl.title || '');
            const text  = escapeHtml(sl.text  || '');
            const hasOverlay = !!(sl.title || sl.text);

            // リンク種別
            let openTag = '', closeTag = '';
            if (sl.linkType === 'url' && sl.link) {
                const url = escapeHtml(sl.link);
                openTag = `<a href="${url}" target="_blank" rel="noopener noreferrer" style="display:block; width:100%; height:100%; text-decoration:none; color:inherit;">`;
                closeTag = `</a>`;
            } else if (sl.linkType === 'page' && sl.link) {
                const url = escapeHtml(sl.link);
                openTag = `<a href="${url}" style="display:block; width:100%; height:100%; text-decoration:none; color:inherit;">`;
                closeTag = `</a>`;
            }

            out += `${indent}        <div class="swiper-slide" style="position:relative; background:#222;">\n`;
            out += `${indent}            ${openTag}\n`;
            if (img) {
                out += `${indent}                <img src="${img}" style="width:100%; height:100%; object-fit:cover; display:block;">\n`;
            }
            if (hasOverlay) {
                out += `${indent}                <div style="position:absolute; left:0; right:0; bottom:0; padding:16px 20px; background:linear-gradient(transparent, rgba(0,0,0,0.7)); color:#fff;">\n`;
                if (title) out += `${indent}                    <div style="font-size:18px; font-weight:bold; margin-bottom:4px;">${title}</div>\n`;
                if (text)  out += `${indent}                    <div style="font-size:13px; opacity:0.9;">${text}</div>\n`;
                out += `${indent}                </div>\n`;
            }
            out += `${indent}            ${closeTag}\n`;
            out += `${indent}        </div>\n`;
        });
        out += `${indent}    </div>\n`;

        if (pagination) out += `${indent}    <div class="swiper-pagination"></div>\n`;
        if (navigation) {
            out += `${indent}    <div class="swiper-button-prev"></div>\n`;
            out += `${indent}    <div class="swiper-button-next"></div>\n`;
        }
        out += `${indent}</div>\n`;

        // Swiper初期化JS
        const opts = [];
        opts.push(`speed: ${speed}`);
        opts.push(`loop: ${loop}`);
        opts.push(`slidesPerView: ${slidesPerView}`);
        if (slidesPerView > 1) opts.push(`spaceBetween: 10`);
        opts.push(`effect: '${swiperEffect}'`);
        if (useFade)  opts.push(`fadeEffect: { crossFade: true }`);
        if (useCube)  opts.push(`cubeEffect: { shadow: true, slideShadows: true, shadowOffset: 20, shadowScale: 0.94 }`);
        if (useCover) opts.push(`coverflowEffect: { rotate: 30, stretch: 0, depth: 100, modifier: 1, slideShadows: true }`);
        if (useCards) opts.push(`cardsEffect: { perSlideOffset: 8, perSlideRotate: 2 }`);

        if (autoplay) {
            opts.push(`autoplay: { delay: ${delay}, disableOnInteraction: false }`);
        }
        if (pagination) opts.push(`pagination: { el: '#${id} .swiper-pagination', clickable: true }`);
        if (navigation) opts.push(`navigation: { nextEl: '#${id} .swiper-button-next', prevEl: '#${id} .swiper-button-prev' }`);

        const initJs = `
        if (typeof Swiper !== 'undefined') {
            new Swiper('#${id}', {
                ${opts.join(',\n                ')}
            });
        }`;
        this.dynamicJs.push(initJs);

        return out;
    }

    renderArticleGrid(id, animClass, baseStyle, props, indent) {
        const g = props.grid || {};
        const items      = Array.isArray(g.items) ? g.items : [];
        const columns    = g.columns ?? 3;
        const gap        = g.gap ?? 20;
        const cardRadius = g.cardRadius ?? 8;
        const arrowColor = g.arrowColor || '#27ae60';
        const imgRatio   = g.imgRatio || '16/10';
        const cardPadding = g.cardPadding ?? 18;
        const sliderMode = g.sliderMode ?? false;

        if (items.length === 0) {
            return `${indent}<div id="${id}" style="${baseStyle} background:#f1f2f6; color:#666; display:flex; align-items:center; justify-content:center;">アイテムが設定されていません</div>\n`;
        }

        // 1枚のカードHTMLを生成する共通関数
        const buildCard = (it) => {
            const img   = it.image ? escapeHtml(resolveImageSrc(it.image, this.imageMap)) : '';
            const title = escapeHtml(it.title || '');
            const text  = escapeHtml(it.text  || '');

            let href = '', target = '';
            if (it.linkType === 'url' && it.link) {
                href = escapeHtml(it.link);
                target = ' target="_blank" rel="noopener noreferrer"';
            } else if (it.linkType === 'page' && it.link) {
                href = escapeHtml(it.link);
            }
            const isLink = !!href;

            const cardStyle = `position: relative; background: #ffffff; border-radius: ${cardRadius}px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; height:100%; ${isLink ? 'cursor: pointer;' : ''}`;
            const tag = isLink ? 'a' : 'div';
            const linkAttrs = isLink ? `href="${href}"${target} style="text-decoration: none; color: inherit; display: block; height:100%;"` : '';

            let c = `<${tag} ${linkAttrs} class="article-card" style="${cardStyle}">`;
            if (img && imgRatio !== 'none') {
                c += `<div style="width:100%; aspect-ratio: ${imgRatio}; overflow:hidden;"><img src="${img}" style="width:100%; height:100%; object-fit:cover; display:block;" alt="${title}"></div>`;
            } else if (img) {
                c += `<div style="width:100%; overflow:hidden;"><img src="${img}" style="width:100%; height:auto; object-fit:cover; display:block;" alt="${title}"></div>`;
            }
            c += `<div style="padding: ${cardPadding}px ${cardPadding + 2}px ${cardPadding + 32}px ${cardPadding + 2}px;">`;
            if (title) c += `<div style="font-size: 17px; font-weight: bold; color: #222; margin-bottom: 10px; line-height: 1.4;">${title}</div>`;
            if (text)  c += `<div style="font-size: 13px; color: #666; line-height: 1.6;">${text}</div>`;
            c += `</div>`;
            if (isLink) {
                c += `<div style="position:absolute; right:14px; bottom:14px; width:36px; height:36px; background:${arrowColor}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:18px; line-height:1;">→</div>`;
            }
            c += `</${tag}>`;
            return c;
        };

        // ホバー効果は共通
        this.dynamicCss.push(
            `#${id} .article-card:hover { transform: translateY(-4px); box-shadow: 0 8px 20px rgba(0,0,0,0.12); }`
        );

        if (sliderMode) {
            // ===== スライダーモード（Swiperで横スクロール）=====
            const autoplay   = g.autoplay ?? false;
            const delay      = g.delay ?? 3000;
            const loop       = g.loop ?? true;
            const navigation = g.navigation ?? true;

            let out = `${indent}<div id="${id}" class="swiper ${animClass}" style="${baseStyle} padding: 0 ${navigation ? '44px' : '0'};">\n`;
            out += `${indent}    <div class="swiper-wrapper" style="padding-bottom:4px;">\n`;
            items.forEach(it => {
                out += `${indent}        <div class="swiper-slide" style="height:auto;">${buildCard(it)}</div>\n`;
            });
            out += `${indent}    </div>\n`;
            if (navigation) {
                out += `${indent}    <div class="swiper-button-prev" style="color:${arrowColor};"></div>\n`;
                out += `${indent}    <div class="swiper-button-next" style="color:${arrowColor};"></div>\n`;
            }
            out += `${indent}</div>\n`;

            const opts = [];
            opts.push(`slidesPerView: ${columns}`);
            opts.push(`spaceBetween: ${gap}`);
            opts.push(`loop: ${loop}`);
            if (autoplay) opts.push(`autoplay: { delay: ${delay}, disableOnInteraction: false }`);
            if (navigation) opts.push(`navigation: { nextEl: '#${id} .swiper-button-next', prevEl: '#${id} .swiper-button-prev' }`);
            // レスポンシブ: 狭い画面では表示枚数を減らす
            opts.push(`breakpoints: { 0: { slidesPerView: 1 }, 600: { slidesPerView: ${Math.min(2, columns)} }, 900: { slidesPerView: ${columns} } }`);

            this.dynamicJs.push(`
        if (typeof Swiper !== 'undefined') {
            new Swiper('#${id}', {
                ${opts.join(',\n                ')}
            });
        }`);

            return out;
        }

        // ===== 通常グリッドモード =====
        const containerStyle = `${baseStyle} display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: ${gap}px; padding: 0; box-sizing: border-box; align-items: start;`;
        let out = `${indent}<div id="${id}" class="${animClass}" style="${containerStyle}">\n`;
        items.forEach(it => {
            out += `${indent}    ${buildCard(it)}\n`;
        });
        out += `${indent}</div>\n`;

        // モバイル対応: 768px以下は1カラム
        this.dynamicCss.push(
            `@media (max-width: 768px) { #${id} { grid-template-columns: 1fr !important; } }`
        );

        return out;
    }

    renderAccordion(id, animClass, baseStyle, props, indent) {
        const a = props.accordion || {};
        const items = Array.isArray(a.items) ? a.items : [];
        const headerColor = a.headerColor || '#2c3e50';
        const headerBg    = a.headerBg || '#f7f9fa';
        const bodyColor   = a.bodyColor || '#555555';
        const openFirst   = a.openFirst ?? true;

        if (items.length === 0) {
            return `${indent}<div id="${id}" style="${baseStyle} background:#f1f2f6; color:#666; display:flex; align-items:center; justify-content:center;">項目が設定されていません</div>\n`;
        }

        let out = `${indent}<div id="${id}" class="accordion ${animClass}" style="${baseStyle} background:transparent;">\n`;
        items.forEach((it, idx) => {
            const title   = escapeHtml(it.title || '');
            const content = escapeHtml(it.content || '').replace(/\n/g, '<br>');
            const isOpen  = openFirst && idx === 0;

            out += `${indent}    <div class="acc-item" style="border:1px solid #e0e0e0; border-radius:6px; margin-bottom:8px; overflow:hidden;">\n`;
            out += `${indent}        <button class="acc-header" aria-expanded="${isOpen}" style="width:100%; text-align:left; padding:16px 20px; background:${headerBg}; color:${headerColor}; border:none; font-size:16px; font-weight:bold; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">\n`;
            out += `${indent}            <span>${title}</span>\n`;
            out += `${indent}            <span class="acc-icon" style="transition:transform 0.3s; transform:rotate(${isOpen ? '180deg' : '0deg'});">▼</span>\n`;
            out += `${indent}        </button>\n`;
            out += `${indent}        <div class="acc-body" style="max-height:${isOpen ? '500px' : '0'}; overflow:hidden; transition:max-height 0.3s ease;">\n`;
            out += `${indent}            <div style="padding:16px 20px; color:${bodyColor}; font-size:14px; line-height:1.7;">${content}</div>\n`;
            out += `${indent}        </div>\n`;
            out += `${indent}    </div>\n`;
        });
        out += `${indent}</div>\n`;

        // 開閉JS
        this.dynamicJs.push(`
        (function() {
            var acc = document.getElementById('${id}');
            if (!acc) return;
            acc.querySelectorAll('.acc-header').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var body = btn.nextElementSibling;
                    var icon = btn.querySelector('.acc-icon');
                    var isOpen = btn.getAttribute('aria-expanded') === 'true';
                    if (isOpen) {
                        body.style.maxHeight = '0';
                        btn.setAttribute('aria-expanded', 'false');
                        if (icon) icon.style.transform = 'rotate(0deg)';
                    } else {
                        body.style.maxHeight = body.scrollHeight + 'px';
                        btn.setAttribute('aria-expanded', 'true');
                        if (icon) icon.style.transform = 'rotate(180deg)';
                    }
                });
            });
        })();`);

        return out;
    }
}