// ============================================================
// インスペクター (プロパティパネル)
// ============================================================
import { layer, tr } from './canvas.js';
import { selectedNodes, setSelectedNodes, currentDevice } from './state.js';
import { saveHistory } from './history.js';
import { renderExplorer } from './explorer.js';
import { applyNodeShadow, applyTextStyle, applyImageCover, applyGradient, applyCornerRadius, applyStroke, applyDropShadow } from './elements.js';
import { markMobileEdited, updatePcGeom } from './display.js';
import { showToast } from './toast.js';

// 画像をダイアログから取得（api.js への循環参照を避けるためローカルに実装）
async function pickImageDialog() {
    try {
        const result = await window.electronAPI.pickImage();
        return result?.dataUrl ?? null;
    } catch {
        showToast('画像の選択に失敗しました。', null, true);
        return null;
    }
}

// type=color 入力に安全に値を設定する（#rrggbb 以外は既定値にフォールバック）
function setColorInput(id, val, def) {
    const el = document.getElementById(id);
    if (!el) return;
    const v = (typeof val === 'string' && val) ? val : def;
    // Pickr のスウォッチ(.color-field＋隠しinput)があればそちらへ、無ければ従来 type=color(hex)
    if (window.__setColorField && document.querySelector(`.color-field[data-for="${id}"]`)) {
        window.__setColorField(id, v);
    } else {
        el.value = /^#[0-9a-fA-F]{6}$/.test(v) ? v : def;
    }
}


export function hideInspector() {
    document.getElementById('ins-fields').style.display = 'none';
    document.getElementById('ins-empty').style.display  = 'block';
}

export function updateInspectorFromNode() {
    if (selectedNodes.length === 0) { hideInspector(); return; }

    document.getElementById('ins-fields').style.display = 'block';
    document.getElementById('ins-empty').style.display  = 'none';

    if (selectedNodes.length > 1) {
        document.getElementById('ins-fields-single').style.display = 'none';
        document.getElementById('ins-fields-multi').style.display  = 'block';
        return;
    }

    document.getElementById('ins-fields-single').style.display = 'block';
    document.getElementById('ins-fields-multi').style.display  = 'none';

    const node  = selectedNodes[0];
    const bData = node.getAttr('bladeData');
    const type  = node.getAttr('uiType');

    document.getElementById('ins-name').value     = bData.name;
    document.getElementById('ins-x').value        = Math.round(node.x());
    document.getElementById('ins-y').value        = Math.round(node.y());
    document.getElementById('ins-w').value        = Math.round(node.width());
    document.getElementById('ins-h').value        = Math.round(node.height());
    document.getElementById('ins-text').value     = bData.text ?? '';
    // type=color は #rrggbb 以外（undefined / 'transparent' 等）を入れるとコンソール
    // エラーになるので、妥当な16進カラーのみ反映し、それ以外は無難な既定値にする。
    setColorInput('ins-bgcolor', bData.bgcolor, '#ffffff');
    setColorInput('ins-color',   bData.color,   '#000000');
    // 不透明度（0=透明〜1=不透明）。未設定なら1。
    // ※ この行は必ず const bData の宣言より後に置くこと（TDZエラー防止）
    const opacityInput = document.getElementById('ins-opacity');
    if (opacityInput) opacityInput.value = bData.opacity ?? 1;
    document.getElementById('ins-align').value      = bData.align || 'left';
    document.getElementById('ins-fontfamily').value = bData.fontfamily || 'sans-serif';
    
    if (type === 'Label' || type === 'Button') {
        document.getElementById('group-text-align').style.display = 'block';
    } else {
        document.getElementById('group-text-align').style.display = 'none';
    }
    // ボタンの時だけ背景画像UIを表示
    const groupBgImage = document.getElementById('group-btn-bgimage');
    if (groupBgImage) {
        groupBgImage.style.display = (type === 'Button') ? 'block' : 'none';
        document.getElementById('ins-bgimage-preview').innerText = bData.bgimage ? '画像セット済み' : 'なし';
    }

    // ▼ スライダー専用設定の表示と値同期 ▼
    const groupSlider = document.getElementById('group-slider');
    if (groupSlider) {
        groupSlider.style.display = (type === 'Slider') ? 'block' : 'none';
        if (type === 'Slider') {
            const s = bData.slider || {};
            document.getElementById('ins-slider-effect').value     = s.effect ?? 'slide';
            document.getElementById('ins-slider-speed').value      = s.speed ?? 600;
            document.getElementById('ins-slider-autoplay').checked = s.autoplay ?? true;
            document.getElementById('ins-slider-delay').value      = s.delay ?? 3000;
            document.getElementById('ins-slider-loop').checked     = s.loop ?? true;
            document.getElementById('ins-slider-pagination').checked = s.pagination ?? true;
            document.getElementById('ins-slider-navigation').checked = s.navigation ?? true;
            document.getElementById('ins-slider-perview').value    = s.slidesPerView ?? 1;
        }
    }

    // ▼ 記事グリッド専用設定の表示と値同期 ▼
    const groupGrid = document.getElementById('group-grid');
    if (groupGrid) {
        groupGrid.style.display = (type === 'ArticleGrid') ? 'block' : 'none';
        if (type === 'ArticleGrid') {
            const g = bData.grid || {};
            document.getElementById('ins-grid-columns').value = g.columns ?? 3;
            document.getElementById('ins-grid-gap').value     = g.gap ?? 20;
            document.getElementById('ins-grid-radius').value  = g.cardRadius ?? 8;
            setColorInput('ins-grid-arrow', g.arrowColor, '#27ae60');
            document.getElementById('ins-grid-imgratio').value = g.imgRatio ?? '16/10';
            document.getElementById('ins-grid-padding').value  = g.cardPadding ?? 18;
            document.getElementById('ins-grid-slidermode').checked = g.sliderMode ?? false;
            document.getElementById('ins-grid-autoplay').checked   = g.autoplay ?? false;
            document.getElementById('ins-grid-delay').value        = g.delay ?? 3000;
            document.getElementById('ins-grid-loop').checked       = g.loop ?? true;
            document.getElementById('ins-grid-nav').checked        = g.navigation ?? true;
            // スライダーモードのサブパネル表示切替
            document.getElementById('group-grid-slider').style.display = (g.sliderMode ? 'block' : 'none');
        }
    }

    // ▼ アコーディオン専用設定の表示と値同期 ▼
    const groupAcc = document.getElementById('group-accordion');
    if (groupAcc) {
        groupAcc.style.display = (type === 'Accordion') ? 'block' : 'none';
        if (type === 'Accordion') {
            const a = bData.accordion || {};
            setColorInput('ins-acc-headercolor', a.headerColor, '#2c3e50');
            setColorInput('ins-acc-headerbg',    a.headerBg,    '#f7f9fa');
            setColorInput('ins-acc-bodycolor',   a.bodyColor,   '#555555');
            document.getElementById('ins-acc-openfirst').checked = a.openFirst ?? true;
        }
    }

    // フォントサイズはデバイスに応じた値を出す
    const displayFontsize = (currentDevice === 'mobile' && bData.layouts?.mobile?.fontsize !== undefined)
        ? bData.layouts.mobile.fontsize
        : (bData.fontsize || 16);
    document.getElementById('ins-fontsize').value = displayFontsize;
    document.getElementById('ins-route').value    = bData.route || '#';
    document.getElementById('ins-method').value   = bData.method;

    document.getElementById('group-backend').style.display = (type === 'Button' || type === 'Image') ? 'block' : 'none';
    document.getElementById('btn-ungroup').style.display   = (type === 'Group')  ? 'block' : 'none';
    document.getElementById('group-text').style.display    = (type === 'Image')  ? 'none'  : 'block';

    // ▼ フォーム: ボタンの役割（リンク / 送信ボタン）
    const groupBtnRole = document.getElementById('group-btn-role');
    if (groupBtnRole) {
        groupBtnRole.style.display = (type === 'Button') ? 'block' : 'none';
        const roleSel = document.getElementById('ins-btn-role');
        if (roleSel) roleSel.value = bData.role || 'link';
        // 送信完了メッセージ欄は「送信ボタン」時のみ表示
        const groupSuccess = document.getElementById('group-success-msg');
        if (groupSuccess) {
            groupSuccess.style.display = (type === 'Button' && bData.role === 'submit') ? 'block' : 'none';
            const sm = document.getElementById('ins-success-message');
            if (sm) sm.value = bData.successMessage ?? '送信ありがとうございました。';
        }
    }
    // ▼ フォーム: 入力欄（TextInput）の項目設定
    const groupInput = document.getElementById('group-input');
    if (groupInput) {
        groupInput.style.display = (type === 'TextInput') ? 'block' : 'none';
        if (type === 'TextInput') {
            document.getElementById('ins-input-name').value       = bData.inputName || '';
            document.getElementById('ins-input-type').value       = bData.inputType || 'text';
            document.getElementById('ins-input-required').checked = !!bData.required;
        }
    }
    // ▼ 送信ボタン時はリンク先ラベルを「送信先URL」に切り替える
    const routeLabel = document.getElementById('ins-route-label');
    if (routeLabel) {
        routeLabel.innerText = (type === 'Button' && bData.role === 'submit')
            ? '送信先URL（フォームの action）'
            : 'リンク先URL（Googleフォーム等）';
    }

    const warpBtn = document.getElementById('btn-warp');
    if (warpBtn) {
        warpBtn.style.display = ['Rect', 'Circle', 'Triangle', 'Warp'].includes(type) ? 'block' : 'none';
    }

    document.getElementById('ins-shadow').value    = bData.shadow || 'none';
    document.getElementById('ins-animation').value = bData.animation || 'none';

    // ▼ ドロップシャドウ（自由値）
    const dsGroup = document.getElementById('group-dropshadow');
    if (dsGroup) {
        const d = bData.dropShadow || { on: false, x: 4, y: 4, blur: 10, spread: 0, color: '#000000', opacity: 0.35 };
        document.getElementById('ins-ds-on').checked   = !!d.on;
        document.getElementById('ins-ds-x').value       = parseFloat(d.x) || 0;
        document.getElementById('ins-ds-y').value       = parseFloat(d.y) || 0;
        document.getElementById('ins-ds-blur').value    = Math.max(0, parseFloat(d.blur) || 0);
        document.getElementById('ins-ds-spread').value  = parseFloat(d.spread) || 0;
        setColorInput('ins-ds-color', d.color, '#000000');
        document.getElementById('ins-ds-opacity').value = Math.min(1, Math.max(0, d.opacity ?? 0.35));
        document.getElementById('dropshadow-fields').style.display = d.on ? 'block' : 'none';
    }

    // ▼ 境界線（Stroke）: 四角・丸・ボタン・画像・テキストで表示
    const strokeGroup = document.getElementById('group-stroke');
    if (strokeGroup) {
        const supportsStroke = ['Rect', 'Circle', 'Button', 'Image', 'Label'].includes(type);
        strokeGroup.style.display = supportsStroke ? 'block' : 'none';
        if (supportsStroke) {
            const s = bData.stroke || { on: false, width: 2, color: '#000000' };
            document.getElementById('ins-stroke-on').checked = !!s.on;
            document.getElementById('ins-stroke-width').value = Math.max(0, parseFloat(s.width) || 0);
            setColorInput('ins-stroke-color', s.color, '#000000');
            document.getElementById('stroke-fields').style.display = s.on ? 'block' : 'none';
        }
    }

    // ▼ 角の丸み（四角・ボタン・画像で表示）
    const cornerGroup = document.getElementById('group-corner');
    if (cornerGroup) {
        const supportsCorner = ['Rect', 'Button', 'Image'].includes(type);
        cornerGroup.style.display = supportsCorner ? 'block' : 'none';
        if (supportsCorner) {
            const cr = document.getElementById('ins-corner');
            if (cr) cr.value = Math.max(0, parseInt(bData.cornerRadius) || 0);
        }
    }

    // ▼ グラデーション設定（図形・ボタン・画像で表示）
    const gradGroup = document.getElementById('group-gradient');
    if (gradGroup) {
        const supportsGrad = ['Rect', 'Circle', 'Triangle', 'Button', 'Image'].includes(type);
        gradGroup.style.display = supportsGrad ? 'block' : 'none';
        if (supportsGrad) {
            const g = bData.gradient || { on: false, type: 'linear', c1: '#4facfe', c2: '#00f2fe', dir: 'v' };
            document.getElementById('ins-grad-on').checked   = !!g.on;
            document.getElementById('ins-grad-type').value   = g.type || 'linear';
            document.getElementById('ins-grad-dir').value    = g.dir  || 'v';
            setColorInput('ins-grad-c1', g.c1, '#4facfe');
            setColorInput('ins-grad-c2', g.c2, '#00f2fe');
            document.getElementById('grad-fields').style.display   = g.on ? 'block' : 'none';
            document.getElementById('grad-dir-wrap').style.display = (g.type === 'radial') ? 'none' : 'block';
        }
    }

    renderEventList(node);
}

export function onInspectorUpdate(shouldSaveHistory = true) {
    if (selectedNodes.length !== 1) return;
    const node  = selectedNodes[0];
    const bData = node.getAttr('bladeData');

    bData.name     = document.getElementById('ins-name').value;
    bData.text     = document.getElementById('ins-text').value;
    bData.bgcolor  = document.getElementById('ins-bgcolor').value;   // #rrggbb または rgba(...)
    bData.color    = document.getElementById('ins-color').value;

    // 不透明度: parseFloat が NaN を返しても ?? は NaN を素通りさせてしまうため、
    // Number.isFinite で判定し、0〜1にクランプする（不正値で要素が消えるのを防ぐ）。
    const opacityRaw = parseFloat(document.getElementById('ins-opacity')?.value);
    bData.opacity = Number.isFinite(opacityRaw) ? Math.min(1, Math.max(0, opacityRaw)) : 1;
    node.opacity(bData.opacity); // Konvaノードに透明度を適用

    const newFontsize = parseInt(document.getElementById('ins-fontsize').value) || 16;
    // フォントサイズはデバイスごとに分離: PCはbData.fontsize、スマホは layouts.mobile.fontsize
    if (currentDevice === 'mobile') {
        if (!bData.layouts) bData.layouts = {};
        if (!bData.layouts.mobile) {
            // 初回: 現状のジオメトリで作る
            bData.layouts.mobile = {
                x: node.x(), y: node.y(), w: node.width(), h: node.height(),
                fontsize: bData.fontsize || 16,
            };
        }
        bData.layouts.mobile.fontsize = newFontsize;
        bData.mobileEdited = true;
        // 見た目だけは即時反映用にfontsizeをノードへ。ただしbData.fontsize(=PC正)は触らない
    } else {
        bData.fontsize = newFontsize;
    }
    bData.align      = document.getElementById('ins-align').value;
    bData.fontfamily = document.getElementById('ins-fontfamily').value;
    
    bData.route    = document.getElementById('ins-route').value;
    bData.method   = document.getElementById('ins-method').value;

    bData.shadow    = document.getElementById('ins-shadow').value;
    bData.animation = document.getElementById('ins-animation').value;

    // ドロップシャドウ(自由値)の保存
    if (!bData.dropShadow) bData.dropShadow = {};
    bData.dropShadow.on      = document.getElementById('ins-ds-on').checked;
    bData.dropShadow.x       = parseFloat(document.getElementById('ins-ds-x').value) || 0;
    bData.dropShadow.y       = parseFloat(document.getElementById('ins-ds-y').value) || 0;
    bData.dropShadow.blur    = Math.max(0, parseFloat(document.getElementById('ins-ds-blur').value) || 0);
    bData.dropShadow.spread  = parseFloat(document.getElementById('ins-ds-spread').value) || 0;
    bData.dropShadow.color   = document.getElementById('ins-ds-color').value;
    bData.dropShadow.opacity = Math.min(1, Math.max(0, parseFloat(document.getElementById('ins-ds-opacity').value) || 0));
    document.getElementById('dropshadow-fields').style.display = bData.dropShadow.on ? 'block' : 'none';

    // フォーム関連の保存
    const roleSel = document.getElementById('ins-btn-role');
    if (roleSel && node.getAttr('uiType') === 'Button') {
        bData.role = roleSel.value;
        const sm = document.getElementById('ins-success-message');
        if (sm) bData.successMessage = sm.value;
    }
    if (node.getAttr('uiType') === 'TextInput') {
        bData.inputName = document.getElementById('ins-input-name').value;
        bData.inputType = document.getElementById('ins-input-type').value;
        bData.required  = document.getElementById('ins-input-required').checked;
    }

    // スライダー設定の保存
    if (node.getAttr('uiType') === 'Slider') {
        bData.slider = bData.slider || {};
        bData.slider.effect       = document.getElementById('ins-slider-effect').value;
        bData.slider.speed        = parseInt(document.getElementById('ins-slider-speed').value) || 600;
        bData.slider.autoplay     = document.getElementById('ins-slider-autoplay').checked;
        bData.slider.delay        = parseInt(document.getElementById('ins-slider-delay').value) || 3000;
        bData.slider.loop         = document.getElementById('ins-slider-loop').checked;
        bData.slider.pagination   = document.getElementById('ins-slider-pagination').checked;
        bData.slider.navigation   = document.getElementById('ins-slider-navigation').checked;
        bData.slider.slidesPerView = parseInt(document.getElementById('ins-slider-perview').value) || 1;
    }

    // 記事グリッド設定の保存
    if (node.getAttr('uiType') === 'ArticleGrid') {
        bData.grid = bData.grid || {};
        bData.grid.columns    = parseInt(document.getElementById('ins-grid-columns').value) || 3;
        bData.grid.gap        = parseInt(document.getElementById('ins-grid-gap').value) || 20;
        bData.grid.cardRadius = parseInt(document.getElementById('ins-grid-radius').value) || 0;
        bData.grid.arrowColor = document.getElementById('ins-grid-arrow').value || '#27ae60';
        bData.grid.imgRatio   = document.getElementById('ins-grid-imgratio').value || '16/10';
        bData.grid.cardPadding = parseInt(document.getElementById('ins-grid-padding').value) || 18;
        bData.grid.sliderMode = document.getElementById('ins-grid-slidermode').checked;
        bData.grid.autoplay   = document.getElementById('ins-grid-autoplay').checked;
        bData.grid.delay      = parseInt(document.getElementById('ins-grid-delay').value) || 3000;
        bData.grid.loop       = document.getElementById('ins-grid-loop').checked;
        bData.grid.navigation = document.getElementById('ins-grid-nav').checked;
        // プレースホルダ更新
        const placeholder = node.findOne('.grid-placeholder');
        if (placeholder) {
            const itemCount = (bData.grid.items || []).length;
            placeholder.text(`📰 記事グリッド\n(${itemCount} 件 / ${bData.grid.columns} カラム)\n📋「アイテム一覧を編集」で詳細設定`);
        }
    }

    // アコーディオン設定の保存
    if (node.getAttr('uiType') === 'Accordion') {
        bData.accordion = bData.accordion || {};
        bData.accordion.headerColor = document.getElementById('ins-acc-headercolor').value || '#2c3e50';
        bData.accordion.headerBg    = document.getElementById('ins-acc-headerbg').value || '#f7f9fa';
        bData.accordion.bodyColor   = document.getElementById('ins-acc-bodycolor').value || '#555555';
        bData.accordion.openFirst   = document.getElementById('ins-acc-openfirst').checked;
        const placeholder = node.findOne('.accordion-placeholder');
        if (placeholder) {
            const itemCount = (bData.accordion.items || []).length;
            placeholder.text(`🪗 アコーディオン\n(${itemCount} 項目)\n📋「項目一覧を編集」で詳細設定`);
        }
    }

    applyNodeShadow(node, bData.shadow);
    applyDropShadow(node, bData);  // on の時だけプリセットを上書き
    applyTextStyle(node, bData);

    node.x(parseInt(document.getElementById('ins-x').value));    
    node.y(parseInt(document.getElementById('ins-y').value));
    node.width(parseInt(document.getElementById('ins-w').value));
    node.height(parseInt(document.getElementById('ins-h').value));

    const type = node.getAttr('uiType');
    // 画面上の見た目に反映するフォントサイズ（スマホ表示中はnewFontsize、PCはbData.fontsize）
    const displayFontsize = currentDevice === 'mobile' ? newFontsize : bData.fontsize;

    if (type === 'Label') {
        node.text(bData.text);
        node.fill(bData.color);
        node.fontSize(displayFontsize);
    } else if (type === 'Button') {
        const bg = node.findOne('.btn-bg');
        const txt = node.findOne('.btn-text');
        const bgImgNode = node.findOne('.btn-bgimage');

        if (bg) {
            bg.width(node.width());
            bg.height(node.height());
            bg.fill(bData.bgimage ? null : bData.bgcolor);
        }
        if (bgImgNode) {
            bgImgNode.width(node.width());
            bgImgNode.height(node.height());
        }
        if (txt) {
            txt.width(node.width());
            txt.height(node.height());
            txt.text(bData.text);
            txt.fill(bData.color);
            txt.fontSize(displayFontsize);
        }
    } else if (type === 'Rect') {
        node.fill(bData.bgcolor);
    } else if (type === 'Circle') {
        node.fill(bData.bgcolor);
        node.radiusX(parseInt(document.getElementById('ins-w').value) / 2);
        node.radiusY(parseInt(document.getElementById('ins-h').value) / 2);
    } else if (type === 'Triangle') {
        node.fill(bData.bgcolor);
        // 幅・高さは上の node.width()/height() で設定済み（sceneFunc が箱に合わせて再描画）
    } else if (type === 'Image') {
        applyImageCover(node);
    }

    // 角の丸みの保存と適用
    if (['Rect', 'Button', 'Image'].includes(type)) {
        bData.cornerRadius = Math.max(0, parseInt(document.getElementById('ins-corner').value) || 0);
        applyCornerRadius(node, bData);
    }

    // 境界線(Stroke)の保存と適用
    if (['Rect', 'Circle', 'Button', 'Image', 'Label'].includes(type)) {
        if (!bData.stroke) bData.stroke = {};
        bData.stroke.on    = document.getElementById('ins-stroke-on').checked;
        bData.stroke.width = Math.max(0, parseFloat(document.getElementById('ins-stroke-width').value) || 0);
        bData.stroke.color = document.getElementById('ins-stroke-color').value;
        applyStroke(node, bData);
        document.getElementById('stroke-fields').style.display = bData.stroke.on ? 'block' : 'none';
    }

    // グラデーション設定の保存と適用（単色塗りの後に上書き）
    if (['Rect', 'Circle', 'Triangle', 'Button', 'Image'].includes(type)) {
        if (!bData.gradient) bData.gradient = {};
        bData.gradient.on   = document.getElementById('ins-grad-on').checked;
        bData.gradient.type = document.getElementById('ins-grad-type').value;
        bData.gradient.dir  = document.getElementById('ins-grad-dir').value;
        bData.gradient.c1   = document.getElementById('ins-grad-c1').value;
        bData.gradient.c2   = document.getElementById('ins-grad-c2').value;
        applyGradient(node, bData);  // Image は no-op（DOMオーバーレイ側で描画）
        // チェックON/種類変更に応じて詳細欄の表示を即時に切り替える（再選択を待たない）
        document.getElementById('grad-fields').style.display   = bData.gradient.on ? 'block' : 'none';
        document.getElementById('grad-dir-wrap').style.display = (bData.gradient.type === 'radial') ? 'none' : 'block';
    }

    node.setAttr('bladeData', bData);
    tr.forceUpdate();
    layer.batchDraw();
    renderExplorer();

    // 編集デバイスに応じて、PC配置のバックアップ or スマホ配置を更新
    updatePcGeom(node);
    markMobileEdited(node);

    if (shouldSaveHistory) {
        saveHistory();
    }
}

// 背景画像の選択ダイアログ処理
window.changeButtonBgImage = async () => {
    if (selectedNodes.length !== 1 || selectedNodes[0].getAttr('uiType') !== 'Button') return;
    const node = selectedNodes[0];
    const bData = node.getAttr('bladeData');

    const dataUrl = await pickImageDialog();
    if (dataUrl) {
        bData.bgimage = dataUrl;
        const bgImgNode = node.findOne('.btn-bgimage');
        const bg = node.findOne('.btn-bg');
        
        if (bgImgNode) {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                bgImgNode.image(img);
                bgImgNode.visible(true);
                if (bg) bg.fill(null);
                layer.batchDraw();
            };
            img.src = dataUrl;
        }
        node.setAttr('bladeData', bData);
        updateInspectorFromNode();
        saveHistory();
    }
};

// 背景画像のクリア処理
window.clearButtonBgImage = () => {
    if (selectedNodes.length !== 1 || selectedNodes[0].getAttr('uiType') !== 'Button') return;
    const node = selectedNodes[0];
    const bData = node.getAttr('bladeData');

    bData.bgimage = '';
    const bgImgNode = node.findOne('.btn-bgimage');
    const bg = node.findOne('.btn-bg');

    if (bgImgNode) bgImgNode.visible(false);
    if (bg) bg.fill(bData.bgcolor);

    node.setAttr('bladeData', bData);
    layer.batchDraw();
    updateInspectorFromNode();
    saveHistory();
};

// ============================================================
// スライダー編集モーダル（画像+タイトル+本文+リンクをスライドごとに編集）
// ============================================================

// スライド/アイテム配列を取得（Slider→slider.slides, ArticleGrid→grid.items）
function getSlides(node) {
    const bData = node.getAttr('bladeData');
    const type = node.getAttr('uiType');
    if (type === 'ArticleGrid') {
        if (!bData.grid) bData.grid = {};
        if (!Array.isArray(bData.grid.items)) bData.grid.items = [];
        return bData.grid.items;
    }
    // Slider
    if (!bData.slider) bData.slider = {};
    if (!Array.isArray(bData.slider.slides)) {
        // 旧データ: text に画像URLがカンマ区切り → 新スキーマに変換
        const legacy = (bData.text || '').split(',').map(s => s.trim()).filter(Boolean);
        bData.slider.slides = legacy.map(url => ({ image: url, title: '', text: '', linkType: 'none', link: '' }));
    }
    return bData.slider.slides;
}

function saveSlides(node, slides) {
    const bData = node.getAttr('bladeData');
    const type = node.getAttr('uiType');
    if (type === 'ArticleGrid') {
        bData.grid = bData.grid || {};
        bData.grid.items = slides;
    } else {
        bData.slider = bData.slider || {};
        bData.slider.slides = slides;
    }
    node.setAttr('bladeData', bData);
}

// 現在のプロジェクトのページ一覧を取得（リンク先候補）
function getPageOptions() {
    // 動的import避け: window 経由で project からページ一覧を取りに行く
    try {
        const proj = window.__getProjectPagesForSlider?.();
        return proj || [];
    } catch { return []; }
}

// モーダルの再描画
function renderSliderEditor(node) {
    const list = document.getElementById('slider-editor-list');
    if (!list) return;
    list.innerHTML = '';

    const slides = getSlides(node);
    const pages  = getPageOptions();

    slides.forEach((sl, idx) => {
        const card = document.createElement('div');
        card.style.cssText = 'display:flex; gap:10px; padding:10px; background:#2d2d2d; border:1px solid #444; border-radius:5px; margin-bottom:8px;';

        // 左: 画像プレビュー+選択
        const left = document.createElement('div');
        left.style.cssText = 'width:120px; flex-shrink:0;';
        const thumb = document.createElement('div');
        thumb.style.cssText = 'width:120px; height:80px; background:#1e1e1e; border:2px dashed #555; border-radius:3px; display:flex; align-items:center; justify-content:center; overflow:hidden; cursor:pointer; color:#888; font-size:11px; text-align:center;';
        if (sl.image) {
            const img = document.createElement('img');
            img.src = sl.image;
            img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
            img.onerror = () => { thumb.innerText = '画像エラー'; };
            thumb.innerHTML = ''; thumb.appendChild(img);
        } else {
            thumb.innerText = 'クリック or D&D\nで画像追加';
        }
        // クリックでファイルダイアログ
        thumb.onclick = async () => {
            const dataUrl = await pickImageDialog();
            if (dataUrl) { sl.image = dataUrl; saveSlides(node, slides); renderSliderEditor(node); saveHistory(); }
        };
        // D&D
        thumb.ondragover = e => { e.preventDefault(); thumb.style.borderColor = '#007acc'; };
        thumb.ondragleave = () => { thumb.style.borderColor = '#555'; };
        thumb.ondrop = async e => {
            e.preventDefault();
            thumb.style.borderColor = '#555';
            const file = e.dataTransfer.files?.[0];
            if (!file || !file.type.startsWith('image/')) return;
            const dataUrl = await new Promise(res => {
                const r = new FileReader();
                r.onload = ev => res(ev.target.result);
                r.readAsDataURL(file);
            });
            sl.image = dataUrl;
            saveSlides(node, slides);
            renderSliderEditor(node);
            saveHistory();
        };
        left.appendChild(thumb);

        const numLabel = document.createElement('div');
        numLabel.style.cssText = 'font-size:10px; color:#aaa; margin-top:4px; text-align:center;';
        numLabel.innerText = `スライド ${idx + 1}`;
        left.appendChild(numLabel);

        card.appendChild(left);

        // 右: タイトル・本文・リンク
        const right = document.createElement('div');
        right.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:5px;';

        const titleIn = document.createElement('input');
        titleIn.type = 'text';
        titleIn.placeholder = 'タイトル（見出し）';
        titleIn.value = sl.title || '';
        titleIn.style.cssText = 'padding:5px; background:#1e1e1e; color:#fff; border:1px solid #555; border-radius:3px; font-size:12px;';
        titleIn.oninput = () => { sl.title = titleIn.value; saveSlides(node, slides); };
        titleIn.onchange = () => saveHistory();
        right.appendChild(titleIn);

        const textIn = document.createElement('textarea');
        textIn.placeholder = '本文';
        textIn.value = sl.text || '';
        textIn.rows = 2;
        textIn.style.cssText = 'padding:5px; background:#1e1e1e; color:#fff; border:1px solid #555; border-radius:3px; font-size:12px; resize:vertical;';
        textIn.oninput = () => { sl.text = textIn.value; saveSlides(node, slides); };
        textIn.onchange = () => saveHistory();
        right.appendChild(textIn);

        // リンク種別 + リンク先
        const linkRow = document.createElement('div');
        linkRow.style.cssText = 'display:flex; gap:5px;';

        const linkSel = document.createElement('select');
        linkSel.style.cssText = 'padding:4px; background:#1e1e1e; color:#fff; border:1px solid #555; border-radius:3px; font-size:11px; min-width:90px;';
        ['none','url','page'].forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.innerText = v === 'none' ? 'リンクなし' : v === 'url' ? '外部URL' : '内部ページ';
            if ((sl.linkType || 'none') === v) opt.selected = true;
            linkSel.appendChild(opt);
        });

        const buildLinkInput = () => {
            const old = linkRow.querySelector('.slider-link-target');
            if (old) old.remove();
            const t = linkSel.value;
            if (t === 'none') return;
            let el;
            if (t === 'page') {
                el = document.createElement('select');
                pages.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.path;
                    opt.innerText = p.name;
                    if (sl.link === p.path) opt.selected = true;
                    el.appendChild(opt);
                });
                el.onchange = () => { sl.link = el.value; saveSlides(node, slides); saveHistory(); };
            } else {
                el = document.createElement('input');
                el.type = 'text';
                el.placeholder = 'https://example.com';
                el.value = sl.link || '';
                el.oninput = () => { sl.link = el.value; saveSlides(node, slides); };
                el.onchange = () => saveHistory();
            }
            el.className = 'slider-link-target';
            el.style.cssText = 'flex:1; padding:4px; background:#1e1e1e; color:#fff; border:1px solid #555; border-radius:3px; font-size:11px;';
            linkRow.appendChild(el);
        };

        linkSel.onchange = () => {
            sl.linkType = linkSel.value;
            if (sl.linkType === 'none') sl.link = '';
            saveSlides(node, slides);
            buildLinkInput();
            saveHistory();
        };
        linkRow.appendChild(linkSel);
        buildLinkInput();
        right.appendChild(linkRow);

        card.appendChild(right);

        // 右端: 上下/削除
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; flex-direction:column; gap:3px;';
        const upBtn = document.createElement('button');
        upBtn.innerText = '↑'; upBtn.title = '上へ';
        upBtn.style.cssText = 'width:28px; padding:2px; background:#444; border:none; color:#fff; margin:0; font-size:11px;';
        upBtn.onclick = () => {
            if (idx === 0) return;
            [slides[idx - 1], slides[idx]] = [slides[idx], slides[idx - 1]];
            saveSlides(node, slides); renderSliderEditor(node); saveHistory();
        };
        const downBtn = document.createElement('button');
        downBtn.innerText = '↓'; downBtn.title = '下へ';
        downBtn.style.cssText = 'width:28px; padding:2px; background:#444; border:none; color:#fff; margin:0; font-size:11px;';
        downBtn.onclick = () => {
            if (idx === slides.length - 1) return;
            [slides[idx + 1], slides[idx]] = [slides[idx], slides[idx + 1]];
            saveSlides(node, slides); renderSliderEditor(node); saveHistory();
        };
        const delBtn = document.createElement('button');
        delBtn.innerText = '✕'; delBtn.title = '削除';
        delBtn.style.cssText = 'width:28px; padding:2px; background:#cc4545; border:none; color:#fff; margin:0; font-size:11px;';
        delBtn.onclick = () => {
            slides.splice(idx, 1);
            saveSlides(node, slides); renderSliderEditor(node); saveHistory();
        };
        actions.appendChild(upBtn);
        actions.appendChild(downBtn);
        actions.appendChild(delBtn);
        card.appendChild(actions);

        list.appendChild(card);
    });

    if (slides.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#888; font-size:12px; padding:20px; text-align:center;';
        empty.innerText = 'スライドがありません。下の「＋ スライドを追加」で追加してください。';
        list.appendChild(empty);
    }
}

let editorTargetNode = null;

window.openSliderEditor = () => {
    if (selectedNodes.length !== 1) return;
    const node = selectedNodes[0];
    if (node.getAttr('uiType') !== 'Slider') return;
    editorTargetNode = node;
    document.getElementById('slider-editor-title').innerText = '📋 スライド一覧の編集';
    document.getElementById('slider-editor-overlay').style.display = 'flex';
    renderSliderEditor(node);
};

window.openGridEditor = () => {
    if (selectedNodes.length !== 1) return;
    const node = selectedNodes[0];
    if (node.getAttr('uiType') !== 'ArticleGrid') return;
    editorTargetNode = node;
    document.getElementById('slider-editor-title').innerText = '📋 記事アイテム一覧の編集';
    document.getElementById('slider-editor-overlay').style.display = 'flex';
    renderSliderEditor(node);
};

window.closeSliderEditor = () => {
    document.getElementById('slider-editor-overlay').style.display = 'none';
    if (editorTargetNode) {
        const type = editorTargetNode.getAttr('uiType');
        if (type === 'Slider') {
            const placeholder = editorTargetNode.findOne('.slider-placeholder');
            if (placeholder) {
                const count = (editorTargetNode.getAttr('bladeData')?.slider?.slides || []).length;
                placeholder.text(`🖼️ スライダー\n(現在 ${count} 枚のスライド)\n📋「スライド一覧を編集」で詳細設定`);
                editorTargetNode.getLayer()?.batchDraw();
            }
        } else if (type === 'ArticleGrid') {
            const placeholder = editorTargetNode.findOne('.grid-placeholder');
            if (placeholder) {
                const bData = editorTargetNode.getAttr('bladeData');
                const count = (bData?.grid?.items || []).length;
                const cols  = bData?.grid?.columns ?? 3;
                placeholder.text(`📰 記事グリッド\n(${count} 件 / ${cols} カラム)\n📋「アイテム一覧を編集」で詳細設定`);
                editorTargetNode.getLayer()?.batchDraw();
            }
        }
    }
    editorTargetNode = null;
};

window.addNewSlide = () => {
    if (!editorTargetNode) return;
    const slides = getSlides(editorTargetNode);
    slides.push({ image: '', title: '', text: '', linkType: 'none', link: '' });
    saveSlides(editorTargetNode, slides);
    renderSliderEditor(editorTargetNode);
    saveHistory();
};

// ============================================================
// アコーディオン項目編集モーダル
// ============================================================
let accordionTargetNode = null;

function getAccordionItems(node) {
    const bData = node.getAttr('bladeData');
    if (!bData.accordion) bData.accordion = {};
    if (!Array.isArray(bData.accordion.items)) bData.accordion.items = [];
    return bData.accordion.items;
}

function renderAccordionEditor(node) {
    const list = document.getElementById('accordion-editor-list');
    if (!list) return;
    list.innerHTML = '';
    const items = getAccordionItems(node);

    items.forEach((it, idx) => {
        const card = document.createElement('div');
        card.style.cssText = 'padding:10px; background:#2d2d2d; border:1px solid #444; border-radius:5px; margin-bottom:8px;';

        const head = document.createElement('div');
        head.style.cssText = 'display:flex; gap:6px; align-items:center; margin-bottom:6px;';
        const num = document.createElement('span');
        num.innerText = `項目 ${idx + 1}`;
        num.style.cssText = 'font-size:11px; color:#aaa; flex:1;';

        const upBtn = document.createElement('button');
        upBtn.innerText = '↑'; upBtn.style.cssText = 'width:26px; padding:2px; background:#444; border:none; color:#fff; margin:0; font-size:11px;';
        upBtn.onclick = () => { if (idx===0) return; [items[idx-1],items[idx]]=[items[idx],items[idx-1]]; node.setAttr('bladeData', node.getAttr('bladeData')); renderAccordionEditor(node); saveHistory(); };
        const downBtn = document.createElement('button');
        downBtn.innerText = '↓'; downBtn.style.cssText = 'width:26px; padding:2px; background:#444; border:none; color:#fff; margin:0; font-size:11px;';
        downBtn.onclick = () => { if (idx===items.length-1) return; [items[idx+1],items[idx]]=[items[idx],items[idx+1]]; node.setAttr('bladeData', node.getAttr('bladeData')); renderAccordionEditor(node); saveHistory(); };
        const delBtn = document.createElement('button');
        delBtn.innerText = '✕'; delBtn.style.cssText = 'width:26px; padding:2px; background:#cc4545; border:none; color:#fff; margin:0; font-size:11px;';
        delBtn.onclick = () => { items.splice(idx,1); node.setAttr('bladeData', node.getAttr('bladeData')); renderAccordionEditor(node); saveHistory(); };

        head.appendChild(num); head.appendChild(upBtn); head.appendChild(downBtn); head.appendChild(delBtn);
        card.appendChild(head);

        const titleIn = document.createElement('input');
        titleIn.type = 'text';
        titleIn.placeholder = '質問・見出し';
        titleIn.value = it.title || '';
        titleIn.style.cssText = 'width:100%; padding:6px; background:#1e1e1e; color:#fff; border:1px solid #555; border-radius:3px; font-size:12px; margin-bottom:5px; box-sizing:border-box;';
        titleIn.oninput = () => { it.title = titleIn.value; node.setAttr('bladeData', node.getAttr('bladeData')); };
        titleIn.onchange = () => saveHistory();
        card.appendChild(titleIn);

        const contentIn = document.createElement('textarea');
        contentIn.placeholder = '回答・本文';
        contentIn.value = it.content || '';
        contentIn.rows = 3;
        contentIn.style.cssText = 'width:100%; padding:6px; background:#1e1e1e; color:#fff; border:1px solid #555; border-radius:3px; font-size:12px; resize:vertical; box-sizing:border-box;';
        contentIn.oninput = () => { it.content = contentIn.value; node.setAttr('bladeData', node.getAttr('bladeData')); };
        contentIn.onchange = () => saveHistory();
        card.appendChild(contentIn);

        list.appendChild(card);
    });

    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#888; font-size:12px; padding:20px; text-align:center;';
        empty.innerText = '項目がありません。下の「＋ 項目を追加」で追加してください。';
        list.appendChild(empty);
    }
}

window.openAccordionEditor = () => {
    if (selectedNodes.length !== 1) return;
    const node = selectedNodes[0];
    if (node.getAttr('uiType') !== 'Accordion') return;
    accordionTargetNode = node;
    document.getElementById('accordion-editor-overlay').style.display = 'flex';
    renderAccordionEditor(node);
};

window.closeAccordionEditor = () => {
    document.getElementById('accordion-editor-overlay').style.display = 'none';
    if (accordionTargetNode) {
        const placeholder = accordionTargetNode.findOne('.accordion-placeholder');
        if (placeholder) {
            const count = (accordionTargetNode.getAttr('bladeData')?.accordion?.items || []).length;
            placeholder.text(`🪗 アコーディオン\n(${count} 項目)\n📋「項目一覧を編集」で詳細設定`);
            accordionTargetNode.getLayer()?.batchDraw();
        }
    }
    accordionTargetNode = null;
};

window.addAccordionItem = () => {
    if (!accordionTargetNode) return;
    const items = getAccordionItems(accordionTargetNode);
    items.push({ title: '新しい質問', content: '回答を入力してください。' });
    accordionTargetNode.setAttr('bladeData', accordionTargetNode.getAttr('bladeData'));
    renderAccordionEditor(accordionTargetNode);
    saveHistory();
};

export function deleteSelectedNode() {
    if (selectedNodes.length === 0) return;
    selectedNodes.forEach(node => node.destroy());
    setSelectedNodes([]);
    tr.nodes([]);
    hideInspector();
    renderExplorer();
    layer.batchDraw();
    saveHistory();
}

export function alignNodes(alignType) {
    if (selectedNodes.length < 2) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    selectedNodes.forEach(node => {
        const x = node.x(); const y = node.y(); const w = node.width(); const h = node.height();
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w; if (y + h > maxY) maxY = y + h;
    });

    selectedNodes.forEach(node => {
        const w = node.width(); const h = node.height();
        switch (alignType) {
            case 'left': node.x(minX); break;
            case 'center': node.x(minX + (maxX - minX) / 2 - w / 2); break;
            case 'right': node.x(maxX - w); break;
            case 'top': node.y(minY); break;
            case 'middle': node.y(minY + (maxY - minY) / 2 - h / 2); break;
            case 'bottom': node.y(maxY - h); break;
        }
        const bData = node.getAttr('bladeData');
        if (bData) node.setAttr('bladeData', bData);
    });

    tr.forceUpdate();
    layer.batchDraw();
    renderExplorer();
    saveHistory();
}

// 複数選択した要素を、指定間隔(px)で横/縦に等間隔配置する
export function distributeNodes(axis) {
    if (selectedNodes.length < 2) return;
    const gap = parseInt(document.getElementById('ins-multi-gap')?.value) || 0;
    const sorted = [...selectedNodes].sort((a, b) => (axis === 'x' ? a.x() - b.x() : a.y() - b.y()));
    let cursor = axis === 'x' ? sorted[0].x() : sorted[0].y();
    sorted.forEach(node => {
        if (axis === 'x') { node.x(cursor); cursor += node.width()  + gap; }
        else              { node.y(cursor); cursor += node.height() + gap; }
        const bData = node.getAttr('bladeData');
        if (bData) node.setAttr('bladeData', bData);
    });
    tr.forceUpdate();
    layer.batchDraw();
    renderExplorer();
    saveHistory();
}

// ============================================================
// ⚡ インタラクション (イベントトリガー) の管理
// ============================================================

// 現在のキャンバスにある全ての要素から、ターゲット候補(IDと名前)のリストを取得
function getTargetOptions(currentId) {
    const options = [{ id: '', name: '-- ターゲットを選択 --' }];
    layer.getChildren().forEach(n => {
        if (n.hasName('ui-element') && n.id() !== currentId) {
            const bData = n.getAttr('bladeData');
            const type = n.getAttr('uiType');
            options.push({ id: n.id(), name: `${bData.name} (${type})` });
        }
    });
    return options;
}

// イベントリストの再描画
export function renderEventList(node) {
    const listEl = document.getElementById('ins-events-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const bData = node.getAttr('bladeData');
    const events = bData.events || [];
    const targetOptions = getTargetOptions(node.id());

    events.forEach((ev, index) => {
        const div = document.createElement('div');
        div.style.cssText = 'background: #252526; border: 1px solid #444; padding: 5px; margin-bottom: 5px; border-radius: 3px; position: relative;';

        // 削除ボタン
        const delBtn = document.createElement('button');
        delBtn.innerText = '✕';
        delBtn.style.cssText = 'position: absolute; top: 2px; right: 2px; width: 20px; padding: 0; background: none; border: none; color: #cc4545; font-size: 12px; margin: 0;';
        delBtn.onclick = () => {
            bData.events.splice(index, 1);
            node.setAttr('bladeData', bData);
            renderEventList(node);
            saveHistory();
        };
        div.appendChild(delBtn);

        // トリガー選択 (いつ)
        const row1 = document.createElement('div');
        row1.className = 'form-group'; row1.style.marginBottom = '3px';
        row1.innerHTML = `<label style="margin:0; font-size:10px;">いつ？ (Trigger)</label>
            <select class="ev-trigger" style="padding: 2px;">
                <option value="click" ${ev.trigger === 'click' ? 'selected' : ''}>クリック時 (OnClick)</option>
                <option value="hover" ${ev.trigger === 'hover' ? 'selected' : ''}>マウスホバー時 (OnHover)</option>
            </select>`;
        
        // アクション選択 (どうする)
        const row2 = document.createElement('div');
        row2.className = 'form-group'; row2.style.marginBottom = '3px';
        row2.innerHTML = `<label style="margin:0; font-size:10px;">どうする？ (Action)</label>
            <select class="ev-action" style="padding: 2px;">
                <option value="show" ${ev.action === 'show' ? 'selected' : ''}>表示する (Show)</option>
                <option value="hide" ${ev.action === 'hide' ? 'selected' : ''}>隠す (Hide)</option>
                <option value="toggle" ${ev.action === 'toggle' ? 'selected' : ''}>表示/非表示を切り替え</option>
                <option value="alert" ${ev.action === 'alert' ? 'selected' : ''}>アラートを出す</option>
            </select>`;

        // ターゲット選択 / テキスト入力 (どれを)
        const row3 = document.createElement('div');
        row3.className = 'form-group'; row3.style.marginBottom = '0';
        
        if (ev.action === 'alert') {
            row3.innerHTML = `<label style="margin:0; font-size:10px;">メッセージ (Text)</label>
                <input type="text" class="ev-target" value="${ev.target}" placeholder="アラートの文章" style="padding: 2px;">`;
        } else {
            let optionsHtml = targetOptions.map(opt => 
                `<option value="${opt.id}" ${ev.target === opt.id ? 'selected' : ''}>${opt.name}</option>`
            ).join('');
            row3.innerHTML = `<label style="margin:0; font-size:10px;">対象要素 (Target)</label>
                <select class="ev-target" style="padding: 2px;">${optionsHtml}</select>`;
        }

        div.appendChild(row1);
        div.appendChild(row2);
        div.appendChild(row3);

        // 値が変更されたら保存
        div.querySelectorAll('select, input').forEach(input => {
            input.onchange = () => {
                ev.trigger = div.querySelector('.ev-trigger').value;
                ev.action = div.querySelector('.ev-action').value;
                ev.target = div.querySelector('.ev-target').value;
                
                // アクションが変わった時は対象の入力UIを再描画
                if (input.classList.contains('ev-action')) {
                    ev.target = ''; // リセット
                    renderEventList(node);
                } else {
                    node.setAttr('bladeData', bData);
                }
                saveHistory();
            };
        });

        listEl.appendChild(div);
    });
}

// ボタンから呼び出される「イベント追加」
window.addEventTrigger = () => {
    if (selectedNodes.length !== 1) return;
    const node = selectedNodes[0];
    const bData = node.getAttr('bladeData');
    if (!bData.events) bData.events = [];
    
    // デフォルトのイベントを追加
    bData.events.push({ trigger: 'click', action: 'toggle', target: '' });
    node.setAttr('bladeData', bData);
    
    renderEventList(node);
    saveHistory();
};