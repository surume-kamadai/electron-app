// ============================================================
// 要素の生成・グループ化・解除
// ============================================================
import { layer, tr } from './canvas.js';
import { selectedNodes, setSelectedNodes, incrementElementCount } from './state.js';
import { saveHistory } from './history.js';
import { updateInspectorFromNode } from './inspector.js';
import { renderExplorer } from './explorer.js';

const DEFAULT_PROPS = {
    Button:    { bgcolor: '#007acc', event: 'submit'   },
    Rect:      { bgcolor: '#cccccc', event: 'none'     },
    Circle:    { bgcolor: '#e74c3c', event: 'none'     },
    Triangle:  { bgcolor: '#2ecc71', event: 'none'     },
    Group:     { bgcolor: 'transparent', event: 'none' },
    TextInput: { bgcolor: '#ffffff', event: 'none'     },
    Label:     { bgcolor: '#ffffff', event: 'none'     },
    Image:     { bgcolor: '#ffffff', event: 'none'     },
};

// --- 選択状態の更新 ---
export function applySelectedNodes(nodes) {
    setSelectedNodes(nodes);
    tr.nodes(nodes);
    tr.moveToTop();
    updateInspectorFromNode();
    renderExplorer();

    // 【Group内子要素のdraggable制御】
    // 子要素は基本ロック (draggable:false)。選択された子だけ一時的に動かせるようにする。
    // これで「Cardをクリック→Cardが動く」「中のLabelをクリック→Labelだけ動く」が両立する。
    layer.find('.ui-element').forEach(n => {
        const isInGroup = n.parent && n.parent.nodeType === 'Group' && n.parent.hasName('ui-element');
        if (!isInGroup) {
            // ルート直下の要素はロック設定（bData.lock）に従う
            const bData = n.getAttr('bladeData');
            n.draggable(!(bData && bData.lock));
        } else {
            // Group内の子: 選択中の子はドラッグ可、それ以外はロック
            const selected = nodes.includes(n);
            const bData = n.getAttr('bladeData');
            const userLocked = !!(bData && bData.lock);
            n.draggable(selected && !userLocked);
        }
    });

    layer.batchDraw();
}

// --- 要素の生成 ---
export function spawnElement(type, loadData = null, parentGroup = layer, isHistoryLoad = false, noHistorySave = false) {
    const count = loadData ? null : incrementElementCount();
    const id    = loadData ? loadData.id : type.toLowerCase() + '_' + count;

    const bData = loadData ? loadData.properties : {
        name:     type + ' ' + count,
        text:     type === 'Image' ? 'https://placehold.co/150x150/png' : 'テキスト',
        bgcolor:  DEFAULT_PROPS[type]?.bgcolor  ?? '#ffffff',
        color:    '#000000',
        fontsize: 16,
        align:    'left',
        fontfamily:'sans-serif',
        lock:     false,
        route:    '#',
        method:   'POST',
        event:    DEFAULT_PROPS[type]?.event ?? 'none',
        shadow:   'none',
        animation:'none',
        opacity:  1,
        bgimage:  '',
        // フォーム用: Button の役割（'link' | 'submit'）
        role:     type === 'Button' ? 'link' : 'none',
        // フォーム送信ボタンの送信完了メッセージ（空なら遷移のみ）
        successMessage: '送信ありがとうございました。',
        // フォーム用: TextInput の入力欄設定
        inputName: '',
        inputType: 'text',   // text | email | tel | number | textarea
        required:  false,
        layouts: loadData ? (loadData.properties.layouts || {}) : {},
        mobileEdited: loadData ? !!loadData.properties.mobileEdited : false,
        events:   loadData && loadData.properties.events ? loadData.properties.events : []
    };

    const tData = loadData ? loadData.transform : { x: 50, y: 50, width: 150, height: 50 };
    const base  = { x: tData.x, y: tData.y, width: tData.width, height: tData.height, draggable: true, name: 'ui-element', id };

    // 【重要】_pcGeom を必ず初期化する。これでスマホ表示中の出力時にPC位置が壊れない。
    // loadDataがあれば properties._pcGeom があればそれを使い、無ければtransformから作る。
    if (loadData) {
        if (!bData._pcGeom) {
            bData._pcGeom = { x: tData.x, y: tData.y, w: tData.width, h: tData.height };
        }
    } else {
        bData._pcGeom = { x: base.x, y: base.y, w: base.width, h: base.height };
    }

    let newNode;
    switch (type) {
        case 'Group':     newNode = new Konva.Group(base); break;
        case 'Button': {
            newNode = new Konva.Group({ ...base });
            
            // 背景用の四角形
            const bg = new Konva.Rect({
                x: 0, y: 0,
                width: base.width, height: base.height,
                fill: bData.bgimage ? null : bData.bgcolor, // 画像があれば色は透明に
                cornerRadius: 5,
                name: 'btn-bg'
            });

            // ボタン用背景画像ノード（初期は非表示または画像ロード）
            const bgImgNode = new Konva.Image({
                x: 0, y: 0,
                width: base.width, height: base.height,
                name: 'btn-bgimage',
                visible: !!bData.bgimage
            });
            
            // 画像URLがある場合はロード
            if (bData.bgimage) {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                    bgImgNode.image(img);
                    layer.batchDraw();
                };
                img.src = bData.bgimage;
            }

            const txt = new Konva.Text({
                x: 0, y: 0,
                width: base.width, height: base.height,
                text: bData.text, fill: bData.color, fontSize: bData.fontsize,
                align: bData.align || 'center',
                fontFamily: bData.fontfamily || 'sans-serif',
                verticalAlign: 'middle',
                name: 'btn-text'
            });
            
            newNode.add(bg, bgImgNode, txt);
            break;
        }
        case 'TextInput': newNode = new Konva.Rect({ ...base, fill: '#fff', stroke: '#ccc', strokeWidth: 1 }); break;
        case 'Label':     newNode = new Konva.Text({ ...base, text: bData.text, fill: bData.color, fontSize: bData.fontsize, align: bData.align || 'left', fontFamily: bData.fontfamily || 'sans-serif' }); break;
        case 'Rect':      newNode = new Konva.Rect({ ...base, fill: bData.bgcolor }); break;
        case 'Warp': {
            const pts = bData.warpPoints || [
                { x: base.x, y: base.y },
                { x: base.x + base.width, y: base.y },
                { x: base.x + base.width, y: base.y + base.height },
                { x: base.x, y: base.y + base.height },
            ];
            const flat = pts.flatMap(p => [p.x, p.y]);
            newNode = new Konva.Line({ points: flat, closed: true, fill: bData.bgcolor, draggable: true, name: 'ui-element', id });
            break;
        }
        case 'Circle':    newNode = new Konva.Ellipse({ ...base, radiusX: base.width / 2, radiusY: base.height / 2, x: base.x + base.width / 2, y: base.y + base.height / 2, fill: bData.bgcolor }); break;
        case 'Triangle':  newNode = new Konva.RegularPolygon({ ...base, sides: 3, radius: Math.min(base.width, base.height) / 2, x: base.x + base.width / 2, y: base.y + base.height / 2, fill: bData.bgcolor }); break;
        case 'Image': {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            newNode = new Konva.Image({ ...base, image: img });
            // 画像読込後にアスペクト調整。万一失敗しても描画は止めない（画像が出なくならないように）
            img.onload = () => {
                try { applyImageCover(newNode); } catch (err) { console.error('[applyImageCover]', err); }
                layer.batchDraw();
            };
            img.onerror = () => {
                console.warn('画像の読み込みに失敗しました。ダミーに差し替えます:', bData.text);
                img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
            };
            img.src = bData.text;
            break;
        }
        case 'Slider': {
            newNode = new Konva.Group({ ...base });
            // 背景
            const bg = new Konva.Rect({
                x: 0, y: 0, width: base.width, height: base.height,
                fill: bData.bgcolor || '#2d3436', cornerRadius: 5
            });
            // スライド数を計算（新スキーマ slides[] 優先、旧 text からの後方互換あり）
            const slideCount = Array.isArray(bData.slider?.slides)
                ? bData.slider.slides.length
                : (bData.text || '').split(',').filter(s => s.trim()).length;
            const txt = new Konva.Text({
                x: 0, y: 0, width: base.width, height: base.height,
                text: `🖼️ スライダー\n(現在 ${slideCount} 枚のスライド)\n📋「スライド一覧を編集」で詳細設定`,
                fill: '#ffffff', fontSize: 14, align: 'center', verticalAlign: 'middle',
                name: 'slider-placeholder',
            });
            newNode.add(bg, txt);
            break;
        }
        case 'ArticleGrid': {
            newNode = new Konva.Group({ ...base });
            const bg = new Konva.Rect({
                x: 0, y: 0, width: base.width, height: base.height,
                fill: bData.bgcolor || '#f8f9fa', cornerRadius: 5
            });
            const itemCount = Array.isArray(bData.grid?.items)
                ? bData.grid.items.length
                : 3;
            const cols = bData.grid?.columns ?? 3;
            const txt = new Konva.Text({
                x: 0, y: 0, width: base.width, height: base.height,
                text: `📰 記事グリッド\n(${itemCount} 件 / ${cols} カラム)\n📋「アイテム一覧を編集」で詳細設定`,
                fill: '#666', fontSize: 14, align: 'center', verticalAlign: 'middle',
                name: 'grid-placeholder',
            });
            newNode.add(bg, txt);
            break;
        }
        case 'Accordion': {
            newNode = new Konva.Group({ ...base });
            const bg = new Konva.Rect({
                x: 0, y: 0, width: base.width, height: base.height,
                fill: bData.bgcolor || '#ffffff', cornerRadius: 5,
                stroke: '#ddd', strokeWidth: 1,
            });
            const itemCount = Array.isArray(bData.accordion?.items)
                ? bData.accordion.items.length
                : 3;
            const txt = new Konva.Text({
                x: 0, y: 0, width: base.width, height: base.height,
                text: `🪗 アコーディオン\n(${itemCount} 項目)\n📋「項目一覧を編集」で詳細設定`,
                fill: '#555', fontSize: 14, align: 'center', verticalAlign: 'middle',
                name: 'accordion-placeholder',
            });
            newNode.add(bg, txt);
            break;
        }
        default: return null;
    }

    if (type === 'Group' && loadData?.children) {
        loadData.children.forEach(child => spawnElement(child.type, child, newNode, isHistoryLoad, true));
    }

    newNode.setAttr('uiType', type);
    newNode.setAttr('bladeData', bData);

    if (loadData) {
        if (bData.lock) {
            newNode.draggable(false);
            newNode.listening(false);
        }
        if (bData.visible === false) {
            newNode.visible(false);
        }
    } else {
        newNode.draggable(true);
        newNode.listening(true);
        bData.lock = false;
        bData.visible = true;
    }

    applyNodeShadow(newNode, bData.shadow);

    // 保存済みの不透明度を読み込み時にKonvaノードへ反映（既定は1=不透明）
    if (typeof bData.opacity === 'number' && Number.isFinite(bData.opacity)) {
        newNode.opacity(Math.min(1, Math.max(0, bData.opacity)));
    }

    newNode.on('dragend transformend', () => {
        updateInspectorFromNode();
        renderExplorer();
        saveHistory();
    });

    parentGroup.add(newNode);

    if (!loadData && !isHistoryLoad) {
        // 新規作成時はPC/スマホ用の layouts は作らない。
        // PC配置は node の x/y/width/height + transform が正データ。
        // スマホ配置はユーザーが📱で動かしたときだけ生成する。
        applySelectedNodes([newNode]);
        if (!noHistorySave) saveHistory();
    }
    return newNode;
}

// --- グループ化 / 解除 ---
export function groupNodes() {
    if (selectedNodes.length < 2) return;
    const count = incrementElementCount();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectedNodes.forEach(node => {
        const box    = node.getClientRect({ skipTransform: true });
        const absPos = node.getAbsolutePosition();
        minX = Math.min(minX, absPos.x);
        minY = Math.min(minY, absPos.y);
        maxX = Math.max(maxX, absPos.x + box.width);
        maxY = Math.max(maxY, absPos.y + box.height);
    });

    const zoom  = tr.getStage().scaleX();
    const gx = minX / zoom, gy = minY / zoom;
    const gw = (maxX - minX) / zoom, gh = (maxY - minY) / zoom;

    const group = new Konva.Group({
        x: gx, y: gy, width: gw, height: gh,
        draggable: true, name: 'ui-element', id: 'group_' + count,
    });
    group.setAttr('uiType', 'Group');
    // 新グループの _pcGeom も初期化（レスポンシブの正データ）
    group.setAttr('bladeData', {
        name: 'フォルダ ' + count, bgcolor: 'transparent', color: '#000', fontsize: 16,
        _pcGeom: { x: gx, y: gy, w: gw, h: gh },
        layouts: {}, mobileEdited: false,
    });
    layer.add(group);

    selectedNodes.forEach(node => {
        const absPos = node.getAbsolutePosition();
        node.moveTo(group);
        node.absolutePosition(absPos);
        // 親が変わったので _pcGeom を新しい相対座標で更新
        const bData = node.getAttr('bladeData');
        if (bData) {
            const type = node.getAttr('uiType');
            let nx = node.x(), ny = node.y(), nw = node.width(), nh = node.height();
            if (type === 'Circle') {
                nx = node.x() - node.radiusX(); ny = node.y() - node.radiusY();
                nw = node.radiusX() * 2; nh = node.radiusY() * 2;
            } else if (type === 'Triangle') {
                const r = node.radius();
                nx = node.x() - r; ny = node.y() - r; nw = r * 2; nh = r * 2;
            }
            bData._pcGeom = { x: nx, y: ny, w: nw, h: nh };
            // グループ化前のスマホ配置は無効になるのでクリア
            if (bData.layouts) delete bData.layouts.mobile;
            bData.mobileEdited = false;
            node.setAttr('bladeData', bData);
        }
    });

    applySelectedNodes([group]);
    saveHistory();
}

export function createEmptyFolder() {
    const node = spawnElement('Group');
    node.width(300);
    node.height(200);
    applySelectedNodes([node]);
    saveHistory();
    return node;
}

export function ungroupNodes() {
    if (selectedNodes.length !== 1 || selectedNodes[0].getAttr('uiType') !== 'Group') return;
    const group      = selectedNodes[0];
    const children   = group.getChildren().slice();
    const newSelected = [];

    children.forEach(child => {
        if (!child.hasName('ui-element')) return;
        const absPos = child.getAbsolutePosition();
        child.moveTo(layer);
        child.absolutePosition(absPos);
        // 親(group)から layer 直下に移動したので _pcGeom を新しい絶対座標で更新
        const bData = child.getAttr('bladeData');
        if (bData) {
            const type = child.getAttr('uiType');
            let nx = child.x(), ny = child.y(), nw = child.width(), nh = child.height();
            if (type === 'Circle') {
                nx = child.x() - child.radiusX(); ny = child.y() - child.radiusY();
                nw = child.radiusX() * 2; nh = child.radiusY() * 2;
            } else if (type === 'Triangle') {
                const r = child.radius();
                nx = child.x() - r; ny = child.y() - r; nw = r * 2; nh = r * 2;
            }
            bData._pcGeom = { x: nx, y: ny, w: nw, h: nh };
            if (bData.layouts) delete bData.layouts.mobile;
            bData.mobileEdited = false;
            child.setAttr('bladeData', bData);
        }
        newSelected.push(child);
    });

    group.destroy();
    applySelectedNodes(newSelected);
    saveHistory();
}

export function applyNodeShadow(node, shadowType) {
    if (!node) return;
    const uiType = node.getAttr('uiType');
    let target = node;

    // タイプごとにシャドウを付ける実描画ターゲットを選ぶ
    if (uiType === 'Button') {
        target = node.findOne('.btn-bg');
    } else if (uiType === 'Slider' || uiType === 'Accordion' || uiType === 'ArticleGrid') {
        // これらは Konva.Group。内部の Rect(背景) にシャドウを付ける
        target = node.findOne('Rect');
    }

    // Group や、シャドウを直接持てないノードはスキップ
    if (uiType === 'Group' || !target || typeof target.shadowColor !== 'function') return;

    // シャドウ種別ごとの設定（offsetX, offsetY, blur, opacity）
    const SHADOWS = {
        light:    { x: 0,  y: 4,  blur: 10, opacity: 0.15 },
        dark:     { x: 0,  y: 8,  blur: 15, opacity: 0.4  },
        hard:     { x: 5,  y: 5,  blur: 0,  opacity: 0.45 }, // くっきり（ぼかしなし）
        diagonal: { x: 10, y: 10, blur: 14, opacity: 0.3  }, // 斜め
        float:    { x: 0,  y: 20, blur: 30, opacity: 0.28 }, // 浮遊（大きめ）
    };

    if (!shadowType || shadowType === 'none' || !SHADOWS[shadowType]) {
        target.shadowOpacity(0);
    } else {
        const s = SHADOWS[shadowType];
        target.shadowColor('#000000');
        target.shadowOffsetX(s.x);
        target.shadowOffsetY(s.y);
        target.shadowBlur(s.blur);
        target.shadowOpacity(s.opacity);
    }
}

export function spawnComponent(componentName) {
    let data = null;

    if (componentName === 'Hero') {
        data = {
            type: 'Group',
            transform: { x: 50, y: 50, width: 800, height: 400 },
            properties: { name: 'Hero Component', bgcolor: 'transparent', shadow: 'none', animation: 'fadein', bgimage: '' },
            children: [
                { type: 'Rect',  transform: { x: 0, y: 0, width: 800, height: 400 }, properties: { name: 'Hero BG', bgcolor: '#2c3e50', shadow: 'none', animation: 'none' } },
                { type: 'Label', transform: { x: 50, y: 100, width: 700, height: 60 }, properties: { name: 'Headline', text: 'Catchy Headline Here', color: '#ffffff', fontsize: 48, shadow: 'none', animation: 'none', align: 'left', fontfamily: 'sans-serif' } },
                { type: 'Label', transform: { x: 50, y: 180, width: 700, height: 40 }, properties: { name: 'Subhead', text: 'Short description goes here. Click to edit.', color: '#bdc3c7', fontsize: 24, shadow: 'none', animation: 'none', align: 'left', fontfamily: 'sans-serif' } },
                { type: 'Button',transform: { x: 50, y: 260, width: 200, height: 50 }, properties: { name: 'CTA Button', text: 'Get Started', bgcolor: '#e74c3c', color: '#ffffff', fontsize: 18, shadow: 'light', animation: 'none', align: 'center', fontfamily: 'sans-serif', bgimage: '' } }
            ]
        };
    } else if (componentName === 'Card') {
        data = {
            type: 'Group',
            transform: { x: 50, y: 50, width: 300, height: 400 },
            properties: { name: 'Card Component', bgcolor: 'transparent', shadow: 'none', animation: 'fadeup', bgimage: '' },
            children: [
                { type: 'Rect',  transform: { x: 0, y: 0, width: 300, height: 400 }, properties: { name: 'Card BG', bgcolor: '#ffffff', shadow: 'light', animation: 'none' } },
                { type: 'Image', transform: { x: 0, y: 0, width: 300, height: 160 }, properties: { name: 'Thumbnail', text: 'https://placehold.co/300x160/png', shadow: 'none', animation: 'none' } },
                { type: 'Label', transform: { x: 20, y: 180, width: 260, height: 30 }, properties: { name: 'Card Title', text: 'Card Title', color: '#333333', fontsize: 24, shadow: 'none', animation: 'none', align: 'left', fontfamily: 'sans-serif' } },
                { type: 'Label', transform: { x: 20, y: 220, width: 260, height: 80 }, properties: { name: 'Card Text', text: 'This is a description inside the card component. Edit this text.', color: '#666666', fontsize: 14, shadow: 'none', animation: 'none', align: 'left', fontfamily: 'sans-serif' } },
                { type: 'Button',transform: { x: 20, y: 320, width: 120, height: 40 }, properties: { name: 'Action Button', text: 'Read More', bgcolor: '#3498db', color: '#ffffff', fontsize: 14, shadow: 'none', animation: 'none', align: 'center', fontfamily: 'sans-serif', bgimage: '' } }
            ]
        };
    } else if (componentName === 'FAQ') {
        data = {
            type: 'Group',
            transform: { x: 50, y: 50, width: 600, height: 100 },
            properties: { name: 'FAQ Item', bgcolor: 'transparent', shadow: 'none', animation: 'slideleft', bgimage: '' },
            children: [
                { type: 'Rect',  transform: { x: 0, y: 0, width: 600, height: 100 }, properties: { name: 'FAQ BG', bgcolor: '#f9f9f9', shadow: 'light', animation: 'none' } },
                { type: 'Label', transform: { x: 20, y: 20, width: 560, height: 30 }, properties: { name: 'Question', text: 'Q: What is this component?', color: '#2c3e50', fontsize: 18, shadow: 'none', animation: 'none', align: 'left', fontfamily: 'sans-serif' } },
                { type: 'Label', transform: { x: 20, y: 60, width: 560, height: 30 }, properties: { name: 'Answer', text: 'A: This is a pre-built FAQ layout block.', color: '#7f8c8d', fontsize: 14, shadow: 'none', animation: 'none', align: 'left', fontfamily: 'sans-serif' } }
            ]
        };
    } else if (componentName === 'Slider') {
        data = {
            type: 'Slider',
            transform: { x: 50, y: 50, width: 600, height: 350 },
            properties: { 
                name: 'Image Slider', 
                bgcolor: '#2d3436', 
                shadow: 'light', 
                animation: 'fadein',
                // カンマ区切りで初期画像を3枚設定
                text: 'https://placehold.co/600x350/png?text=Slide+1,https://placehold.co/600x350/png?text=Slide+2,https://placehold.co/600x350/png?text=Slide+3' 
            }
        };
    } else if (componentName === 'ArticleGrid') {
        data = {
            type: 'ArticleGrid',
            transform: { x: 50, y: 50, width: 900, height: 480 },
            properties: {
                name: 'Article Grid',
                bgcolor: 'transparent',
                shadow: 'none',
                animation: 'fadeup',
                grid: {
                    columns: 3,
                    gap: 20,
                    cardRadius: 8,
                    arrowColor: '#27ae60',
                    items: [
                        { image: 'https://placehold.co/400x240/png?text=Article+1', title: '記事タイトル1', text: 'ここに記事の概要が入ります。クリックで詳細ページに遷移します。', linkType: 'none', link: '' },
                        { image: 'https://placehold.co/400x240/png?text=Article+2', title: '記事タイトル2', text: 'ここに記事の概要が入ります。クリックで詳細ページに遷移します。', linkType: 'none', link: '' },
                        { image: 'https://placehold.co/400x240/png?text=Article+3', title: '記事タイトル3', text: 'ここに記事の概要が入ります。クリックで詳細ページに遷移します。', linkType: 'none', link: '' },
                    ]
                }
            }
        };
    } else if (componentName === 'Accordion') {
        data = {
            type: 'Accordion',
            transform: { x: 50, y: 50, width: 600, height: 300 },
            properties: {
                name: 'Accordion',
                bgcolor: '#ffffff',
                shadow: 'light',
                animation: 'fadeup',
                accordion: {
                    headerColor: '#2c3e50',
                    headerBg: '#f7f9fa',
                    bodyColor: '#555555',
                    openFirst: true,
                    items: [
                        { title: '質問1: このサービスは何ですか？', content: 'ここに回答が入ります。クリックすると開閉します。' },
                        { title: '質問2: 料金はいくらですか？', content: 'ここに回答が入ります。複数行の説明も入れられます。' },
                        { title: '質問3: サポートはありますか？', content: 'ここに回答が入ります。お気軽にお問い合わせください。' },
                    ]
                }
            }
        };
    }

    if (!data) return;

    function assignIds(nodeData) {
        const count = incrementElementCount();
        nodeData.id = nodeData.type.toLowerCase() + '_' + count;
        if (nodeData.children) {
            nodeData.children.forEach(assignIds);
        }
    }
    assignIds(data);

    // data.type に応じて正しい要素を生成（Sliderの場合もある）
    const node = spawnElement(data.type, data, layer, false, true);

    layer.batchDraw();
    applySelectedNodes([node]);
    saveHistory();
}

// 画像を「拡大・切り取りせず、縦横比を保って全体表示」する。
// 以前は cover(crop) で枠を埋めていたが画像が拡大表示されてしまうため、
// クロップを解除し、高さを幅に対する画像の比率へ合わせて歪み・拡大を防ぐ。
// （幅を基準に高さが追従＝アスペクト固定。これで拡大も歪みも起きない）
export function applyImageCover(node) {
    if (!node || node.getAttr('uiType') !== 'Image') return;
    const img = node.image();
    if (!img || !img.width || !img.height) return;
    // クロップ解除＝画像全体を指す crop にする（null を渡すと Konva が例外を投げるため）
    node.crop({ x: 0, y: 0, width: img.width, height: img.height });
    const w = node.width();
    if (w > 0) {
        node.height(Math.max(1, Math.round(w * img.height / img.width)));
    }
}

export function applyTextStyle(node, bData) {
    if (!node) return;
    const type = node.getAttr('uiType');
    
    if (type === 'Label') {
        node.align(bData.align || 'left');
        node.fontFamily(bData.fontfamily || 'sans-serif');
    } else if (type === 'Button') {
        const txt = node.findOne('.btn-text');
        if (txt) {
            txt.align(bData.align || 'center');
            txt.fontFamily(bData.fontfamily || 'sans-serif');
        }
    }
}
// ============================================================
// レスポンシブ用：デバイスレイアウトの適用
// ============================================================
export function syncNodeToLayout(node, device) {
    const bData = node.getAttr('bladeData');
    if (!bData) return;
    if (!bData.layouts) bData.layouts = {};

    let l = bData.layouts[device];

    // 対象デバイスのレイアウトが無いとき：
    //   device=mobile → 何もしない（PC位置のまま表示。ユーザーが動かしたら初めて記録）
    //   device=pc     → PC配置はノードの現状（transformと一致）なので何もしない
    if (!l || l.x === undefined) return;

    if (l.fontsize) bData.fontsize = l.fontsize;

    const type = node.getAttr('uiType');

    // l.x/l.y は左上座標。タイプごとに正しい座標系へ変換して適用する
    if (type === 'Circle') {
        node.radiusX(l.w / 2);
        node.radiusY(l.h / 2);
        node.x(l.x + l.w / 2);
        node.y(l.y + l.h / 2);
    } else if (type === 'Triangle') {
        node.radius(Math.min(l.w, l.h) / 2);
        node.x(l.x + l.w / 2);
        node.y(l.y + l.h / 2);
    } else {
        node.x(l.x);
        node.y(l.y);
        node.width(l.w);
        node.height(l.h);
    }

    if (type === 'Label') {
        node.fontSize(bData.fontsize);
    } else if (type === 'Button') {
        const bg = node.findOne('.btn-bg');
        const txt = node.findOne('.btn-text');
        const bgImgNode = node.findOne('.btn-bgimage');
        if (bg) { bg.width(l.w); bg.height(l.h); }
        if (bgImgNode) { bgImgNode.width(l.w); bgImgNode.height(l.h); }
        if (txt) { txt.width(l.w); txt.height(l.h); txt.fontSize(bData.fontsize); }
    } else if (type === 'Image') {
        applyImageCover(node);
    }

    if (type === 'Group') {
        node.getChildren().forEach(child => {
            if (child.hasName('ui-element')) syncNodeToLayout(child, device);
        });
    }
}