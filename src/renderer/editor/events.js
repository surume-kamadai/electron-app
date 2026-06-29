// ============================================================
// イベントハンドラ
// ステージ操作 / キーボード / パネルドラッグ / 画像D&D / 右クリック
// ============================================================
import { stage, layer, tr, selectionRect } from './canvas.js';
import { selectedNodes, setSelectedNodes, incrementElementCount, lastClickedNode, setLastClickedNode } from './state.js';
import { applySelectedNodes, spawnElement, groupNodes, ungroupNodes, applyImageCover } from './elements.js';
import { saveHistory, undo, redo } from './history.js';
import { updateInspectorFromNode, deleteSelectedNode } from './inspector.js';
import { renderExplorer } from './explorer.js';
import { saveAndExport, importJSON, uploadImage } from './api.js';
import { showToast } from './toast.js';
import { processNode } from './converter.js';
import { markMobileEdited, updatePcGeom } from './display.js';
import { exitWarpMode, isWarpMode, getWarpTarget } from './warp.js';

// ============================================================
// ステージ: トランスフォーム完了時のグループスケール正規化
// ============================================================

// Label / Button のリサイズを「scale」から「width/height + fontSize」へ正規化する。
// ドラッグ中(transform)に毎フレーム呼ぶことで、スケール操作中もリアルタイムに
// 文字サイズが変わる。フォント倍率は縦横の大きい方に追従（どの方向でも変化）。
function normalizeResize(node) {
    const type = node.getAttr('uiType');
    const sx = node.scaleX(), sy = node.scaleY();
    if (sx === 1 && sy === 1) return;

    // フォント倍率: どの方向のドラッグでも文字サイズが変わるよう、縦横の大きい方を使う
    const fontFactor = Math.max(sx, sy);

    if (type === 'Label') {
        node.width(Math.max(5, node.width()  * sx));
        node.height(Math.max(5, node.height() * sy));
        node.scaleX(1); node.scaleY(1);
        const newFont = Math.max(8, node.fontSize() * fontFactor);
        node.fontSize(newFont);
        const b = node.getAttr('bladeData'); if (b) b.fontsize = newFont;
    } else if (type === 'Button') {
        node.width(Math.max(5, node.width()  * sx));
        node.height(Math.max(5, node.height() * sy));
        node.scaleX(1); node.scaleY(1);
        const bg  = node.findOne('.btn-bg');
        const txt = node.findOne('.btn-text');
        if (bg) { bg.width(node.width()); bg.height(node.height()); }
        if (txt) {
            txt.width(node.width()); txt.height(node.height());
            const newFont = Math.max(8, txt.fontSize() * fontFactor);
            txt.fontSize(newFont);
            const b = node.getAttr('bladeData'); if (b) b.fontsize = newFont;
        }
    }
}

// ドラッグ中もリアルタイムに正規化（スケール操作中に文字サイズが追従して変わる）。
// transform イベントは stage に届かない場合があるため、Transformer 自身にも直接
// フックし、対象は tr.nodes()（選択中のノード）から取得して確実に処理する。
function liveNormalizeSelection() {
    let any = false;
    tr.nodes().forEach(node => {
        const t = node.getAttr && node.getAttr('uiType');
        if ((t === 'Label' || t === 'Button') && (node.scaleX() !== 1 || node.scaleY() !== 1)) {
            normalizeResize(node);
            any = true;
        }
    });
    if (any) layer.batchDraw();
}
tr.on('transform', liveNormalizeSelection);
stage.on('transform', liveNormalizeSelection);

// 1ノードのスケールを width/height(+font) に正規化する（Image はカバー再計算）
function normalizeNode(node) {
    const type = node.getAttr('uiType');
    if (type === 'Image') { applyImageCover(node); return; }
    if (type === 'Label' || type === 'Button') { normalizeResize(node); return; }
    if (type !== 'Group') return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    if (scaleX === 1 && scaleY === 1) return;
    node.getChildren().forEach(child => {
        if (!child.hasName('ui-element')) return;
        child.x(child.x() * scaleX);
        child.y(child.y() * scaleY);
        child.width(child.width()  * scaleX);
        child.height(child.height() * scaleY);
        const childType = child.getAttr('uiType');
        if (childType === 'Label') {
            child.fontSize(child.fontSize() * Math.max(scaleX, scaleY));
            child.getAttr('bladeData').fontsize = child.fontSize();
        } else if (childType === 'Button') {
            const bg = child.findOne('.btn-bg');
            const txt = child.findOne('.btn-text');
            if (bg) { bg.width(child.width()); bg.height(child.height()); }
            if (txt) { txt.width(child.width()); txt.height(child.height()); }
        }
    });
    node.width(node.width()   * scaleX);
    node.height(node.height() * scaleY);
    node.scaleX(1);
    node.scaleY(1);
}

// 変形/移動の完了処理（正規化→インスペクタ更新→履歴保存）
function finalizeAfterTransform(nodes) {
    nodes.forEach(normalizeNode);
    updateInspectorFromNode();
    renderExplorer();
    layer.batchDraw();
    nodes.forEach(node => { updatePcGeom(node); markMobileEdited(node); });
    saveHistory();
}

// リサイズ完了（Transformer のイベントを直接使う＝stageに届かない環境でも確実）
tr.on('transformend', () => {
    finalizeAfterTransform(tr.nodes());
});

// 移動完了（ドラッグ）。対象は操作ノード＋選択中ノード（複数選択移動対応）
stage.on('dragend', (e) => {
    const touched = new Set();
    if (e.target && e.target.hasName && e.target.hasName('ui-element')) touched.add(e.target);
    selectedNodes.forEach(n => touched.add(n));
    finalizeAfterTransform([...touched]);
});

// ============================================================
// 【完全版】スマートスナップ（端・中央合わせ ＋ 等間隔配置）
// ============================================================
const SNAP_THRESHOLD = 6; 

let vGuide = document.getElementById('snap-v');
if (!vGuide) {
    vGuide = document.createElement('div');
    vGuide.id = 'snap-v';
    vGuide.className = 'snap-guideline vertical';
    document.getElementById('canvas-wrapper').appendChild(vGuide);
}
let hGuide = document.getElementById('snap-h');
if (!hGuide) {
    hGuide = document.createElement('div');
    hGuide.id = 'snap-h';
    hGuide.className = 'snap-guideline horizontal';
    document.getElementById('canvas-wrapper').appendChild(hGuide);
}

stage.on('dragmove', (e) => {
    const draggingNode = e.target;
    if (!draggingNode.hasName('ui-element') || selectedNodes.length > 1) return;

    const zoom = stage.scaleX();
    let absMinX = draggingNode.x();
    let absMinY = draggingNode.y();
    let absMaxX = absMinX + draggingNode.width();
    let absMaxY = absMinY + draggingNode.height();
    let absMidX = absMinX + draggingNode.width() / 2;
    let absMidY = absMinY + draggingNode.height() / 2;

    let snapX = null, snapY = null;
    let showVLine = false, showHLine = false;
    let guideX = 0, guideY = 0;

    const targets = [];
    layer.getChildren().forEach(n => {
        if (!n.hasName('ui-element') || n === draggingNode || n.className === 'Transformer') return;
        const tData = n.getAttr('bladeData');
        if (n.visible() === false || (tData && tData.lock)) return; 
        
        targets.push({
            minX: n.x(), maxX: n.x() + n.width(),
            minY: n.y(), maxY: n.y() + n.height(),
            midX: n.x() + n.width() / 2, midY: n.y() + n.height() / 2,
        });
    });

    targets.forEach(t => {
        if (Math.abs(absMinX - t.minX) < SNAP_THRESHOLD) { snapX = t.minX; guideX = t.minX; showVLine = true; }
        else if (Math.abs(absMinX - t.maxX) < SNAP_THRESHOLD) { snapX = t.maxX; guideX = t.maxX; showVLine = true; }
        else if (Math.abs(absMaxX - t.minX) < SNAP_THRESHOLD) { snapX = t.minX - draggingNode.width(); guideX = t.minX; showVLine = true; }
        else if (Math.abs(absMaxX - t.maxX) < SNAP_THRESHOLD) { snapX = t.maxX - draggingNode.width(); guideX = t.maxX; showVLine = true; }
        else if (Math.abs(absMidX - t.midX) < SNAP_THRESHOLD) { snapX = t.midX - draggingNode.width() / 2; guideX = t.midX; showVLine = true; }

        if (Math.abs(absMinY - t.minY) < SNAP_THRESHOLD) { snapY = t.minY; guideY = t.minY; showHLine = true; }
        else if (Math.abs(absMinY - t.maxY) < SNAP_THRESHOLD) { snapY = t.maxY; guideY = t.maxY; showHLine = true; }
        else if (Math.abs(absMaxY - t.minY) < SNAP_THRESHOLD) { snapY = t.minY - draggingNode.height(); guideY = t.minY; showHLine = true; }
        else if (Math.abs(absMaxY - t.maxY) < SNAP_THRESHOLD) { snapY = t.maxY - draggingNode.height(); guideY = t.maxY; showHLine = true; }
        else if (Math.abs(absMidY - t.midY) < SNAP_THRESHOLD) { snapY = t.midY - draggingNode.height() / 2; guideY = t.midY; showHLine = true; }
    });

    for (let i = 0; i < targets.length; i++) {
        for (let j = 0; j < targets.length; j++) {
            if (i === j) continue;
            let t1 = targets[i];
            let t2 = targets[j];

            let overlapY = Math.max(0, Math.min(t1.maxY, t2.maxY) - Math.max(t1.minY, t2.minY));
            if (overlapY > 0 && t1.minX >= t2.maxX) {
                let gap = t1.minX - t2.maxX; 
                if (Math.abs(absMinX - (t1.maxX + gap)) < SNAP_THRESHOLD) {
                    snapX = t1.maxX + gap; showVLine = true; guideX = snapX;
                }
                else if (Math.abs(absMaxX - (t2.minX - gap)) < SNAP_THRESHOLD) {
                    snapX = t2.minX - gap - draggingNode.width(); showVLine = true; guideX = snapX + draggingNode.width();
                }
            }

            let overlapX = Math.max(0, Math.min(t1.maxX, t2.maxX) - Math.max(t1.minX, t2.minX));
            if (overlapX > 0 && t1.minY >= t2.maxY) {
                let gap = t1.minY - t2.maxY;
                if (Math.abs(absMinY - (t1.maxY + gap)) < SNAP_THRESHOLD) {
                    snapY = t1.maxY + gap; showHLine = true; guideY = snapY;
                }
                else if (Math.abs(absMaxY - (t2.minY - gap)) < SNAP_THRESHOLD) {
                    snapY = t2.minY - gap - draggingNode.height(); showHLine = true; guideY = snapY + draggingNode.height();
                }
            }
        }
    }

    if (snapX !== null) draggingNode.x(snapX);
    if (snapY !== null) draggingNode.y(snapY);

    if (showVLine) {
        vGuide.style.display = 'block';
        vGuide.style.left = (guideX * zoom) + 'px';
    } else {
        vGuide.style.display = 'none';
    }

    if (showHLine) {
        hGuide.style.display = 'block';
        hGuide.style.top = (guideY * zoom) + 'px';
    } else {
        hGuide.style.display = 'none';
    }

    layer.batchDraw();
});

stage.on('dragend', () => {
    if (vGuide) vGuide.style.display = 'none';
    if (hGuide) hGuide.style.display = 'none';
});

// ============================================================
// ラバーバンド選択
// ============================================================
let x1, y1, x2, y2;

stage.on('mousedown touchstart', e => {
    if (e.target !== stage) return;
    e.evt.preventDefault();
    const pos  = stage.getPointerPosition();
    const zoom = stage.scaleX();
    x1 = pos.x / zoom; y1 = pos.y / zoom;
    x2 = x1; y2 = y1;
    selectionRect.width(0).height(0).visible(true);
});

stage.on('mousemove touchmove', e => {
    if (!selectionRect.visible()) return;
    e.evt.preventDefault();
    const pos  = stage.getPointerPosition();
    const zoom = stage.scaleX();
    x2 = pos.x / zoom; y2 = pos.y / zoom;
    selectionRect.setAttrs({
        x: Math.min(x1, x2), y: Math.min(y1, y2),
        width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
    });
});

stage.on('mouseup touchend', e => {
    if (!selectionRect.visible()) return;
    e.evt.preventDefault();
    setTimeout(() => selectionRect.visible(false));
    const box         = selectionRect.getClientRect();
    const newSelected = layer.getChildren().filter(
        node => node.hasName('ui-element') && Konva.Util.haveIntersection(box, node.getClientRect())
    );
    if (newSelected.length > 0) applySelectedNodes(newSelected);
});

// クリックで要素選択
stage.on('click', e => {
    if (selectionRect.visible()) return;
    let node = e.target;

    // Warp ハンドルをクリックした場合は通常選択処理をスキップ（ハンドル自体のdragが効く）
    if (node.name && node.name() === 'warp-handle') return;

    if (node.getParent?.()?.className === 'Transformer') return;
    while (node.parent?.nodeType === 'Group' && node.parent.hasName('ui-element')) {
        node = node.parent;
    }

    // Warpモード中に対象以外の要素／空白をクリックしたら Warp を抜ける
    if (isWarpMode()) {
        const warpTarget = getWarpTarget();
        const clickedSelf = node === warpTarget;
        if (!clickedSelf) {
            exitWarpMode();
        }
    }

    if (node.hasName?.('ui-element')) {
        let newSelection = [...selectedNodes];
        const ctrlKey = e.evt.ctrlKey || e.evt.metaKey;
        const shiftKey = e.evt.shiftKey;

        if (ctrlKey) {
            // Ctrl+クリック: 個別トグル（追加/除外）
            const index = newSelection.indexOf(node);
            if (index >= 0) newSelection.splice(index, 1);
            else newSelection.push(node);
        } else if (shiftKey && lastClickedNode) {
            // Shift+クリック: 同じ親階層内で、直前選択ノード〜今クリックノードの間を範囲選択
            const parent = node.getParent();
            const lastParent = lastClickedNode.getParent();
            if (parent === lastParent) {
                const siblings = parent.getChildren().filter(c => c.hasName('ui-element'));
                const idxA = siblings.indexOf(lastClickedNode);
                const idxB = siblings.indexOf(node);
                if (idxA >= 0 && idxB >= 0) {
                    const [from, to] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
                    const range = siblings.slice(from, to + 1);
                    // 既存選択にrangeをマージ
                    const set = new Set(newSelection);
                    range.forEach(r => set.add(r));
                    newSelection = Array.from(set);
                } else {
                    newSelection = [node];
                }
            } else {
                // 親が違う場合は単一選択にフォールバック
                newSelection = [node];
            }
        } else {
            newSelection = [node];
        }
        setLastClickedNode(node);
        applySelectedNodes(newSelection);
    } else {
        setLastClickedNode(null);
        applySelectedNodes([]);
    }
});

// ============================================================
// ダブルクリックで Label/Button のテキスト内容をインライン編集
// ============================================================
stage.on('dblclick dbltap', e => {
    let node = e.target;
    if (node.getParent?.()?.className === 'Transformer') return;
    // 子要素(btn-bg/btn-text/内部Rect/Text)から ui-element まで親に登る
    while (node.parent?.nodeType === 'Group' && node.parent.hasName?.('ui-element')) {
        node = node.parent;
    }
    if (!node.hasName?.('ui-element')) return;

    const type = node.getAttr('uiType');
    if (type !== 'Label' && type !== 'Button') return;

    startInlineTextEdit(node);
});

function startInlineTextEdit(node) {
    const bData = node.getAttr('bladeData');
    if (!bData) return;

    // 既存inputがあれば閉じる
    document.querySelector('.inline-text-editor')?.remove();

    // Canvas上の絶対位置を計算
    const stageBox = stage.container().getBoundingClientRect();
    const wrapperBox = document.getElementById('canvas-wrapper').getBoundingClientRect();
    const zoom = stage.scaleX();
    const absPos = node.getAbsolutePosition();
    const w = node.width() * zoom;
    const h = node.height() * zoom;

    const input = document.createElement(node.getAttr('uiType') === 'Label' ? 'textarea' : 'input');
    input.className = 'inline-text-editor';
    input.value = bData.text || '';
    Object.assign(input.style, {
        position: 'fixed',
        left: (stageBox.left + absPos.x * zoom) + 'px',
        top:  (stageBox.top  + absPos.y * zoom) + 'px',
        width:  Math.max(80, w) + 'px',
        height: Math.max(30, h) + 'px',
        fontSize: (bData.fontsize || 16) + 'px',
        fontFamily: bData.fontfamily || 'sans-serif',
        color: bData.color || '#000',
        background: '#fff',
        border: '2px solid #007acc',
        borderRadius: '3px',
        padding: '2px 4px',
        boxSizing: 'border-box',
        zIndex: 99999,
        outline: 'none',
        resize: 'none',
        textAlign: bData.align || 'left',
    });
    document.body.appendChild(input);
    input.focus();
    input.select();

    const commit = () => {
        const v = input.value;
        bData.text = v;
        node.setAttr('bladeData', bData);
        // Konva側の描画も更新
        if (node.getAttr('uiType') === 'Label') {
            node.text(v);
        } else if (node.getAttr('uiType') === 'Button') {
            const txt = node.findOne('.btn-text');
            if (txt) txt.text(v);
        }
        layer.batchDraw();
        // インスペクタも更新
        updateInspectorFromNode();
        // 編集デバイス対応のフック
        updatePcGeom(node);
        markMobileEdited(node);
        cleanup();
        saveHistory();
    };
    const cancel = () => cleanup();
    const cleanup = () => { input.remove(); };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault();
            commit();
        } else if (ev.key === 'Escape') {
            ev.preventDefault();
            cancel();
        }
    });
}

document.getElementById('workspace').addEventListener('mousedown', e => {
    if (e.target.closest('.floating-panel') || e.target.closest('.lm_content') || e.target.closest('#canvas-container') || e.target.closest('.context-menu')) return;
    if (selectedNodes.length > 0) applySelectedNodes([]);
});

// ============================================================
// コピー＆ペースト
// ============================================================
let clipboardData = [];

function copySelected() {
    if (selectedNodes.length === 0) return;
    clipboardData = selectedNodes.map(node => processNode(node));
}

function pasteClipboard() {
    if (clipboardData.length === 0) return;
    applySelectedNodes([]);

    // 旧ID → 新ID のマップ（イベントターゲット再マッピング用）
    const idMap = new Map();

    function regenerateIds(data, isRoot) {
        const count = incrementElementCount();
        const newId = data.type.toLowerCase() + '_' + count;
        idMap.set(data.id, newId);
        data.id = newId;
        if (isRoot) {
            data.properties.name += ' (コピー)';
            data.transform.x += 20;
            data.transform.y += 20;
        }
        data.children?.forEach(child => regenerateIds(child, false));
    }

    // ID再生成（先に全要素のID対応表を作る）
    const cloned = clipboardData.map(data => JSON.parse(JSON.stringify(data)));
    cloned.forEach(data => regenerateIds(data, true));

    // 各要素の events.target を idMap で更新（コピー先要素同士の参照を保つ）
    function remapEvents(data) {
        const events = data.properties?.events;
        if (Array.isArray(events)) {
            events.forEach(ev => {
                // alert以外（show/hide/toggleなど）はtargetが要素ID
                if (ev.action !== 'alert' && idMap.has(ev.target)) {
                    ev.target = idMap.get(ev.target);
                }
            });
        }
        data.children?.forEach(remapEvents);
    }
    cloned.forEach(remapEvents);

    const newSelection = cloned.map(data => spawnElement(data.type, data, layer, false, true));

    applySelectedNodes(newSelection);
    saveHistory();
}

// ============================================================
// キーボードショートカット
// ============================================================
window.addEventListener('keydown', e => {
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveAndExport();
        return;
    }
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

    if      (e.key === 'Delete' || e.key === 'Backspace')         { deleteSelectedNode(); }
    else if (e.ctrlKey && (e.key === 'c' || e.key === 'C'))       { copySelected(); }
    else if (e.ctrlKey && (e.key === 'v' || e.key === 'V'))       { pasteClipboard(); }
    else if (e.ctrlKey && (e.key === 'y' || e.key === 'Y'))       { redo(); }
    else if (e.ctrlKey && (e.key === 'z' || e.key === 'Z'))       { e.shiftKey ? redo() : undo(); }
});

// ============================================================
// 画像のドラッグ＆ドロップ追加
// ============================================================
document.getElementById('workspace').addEventListener('dragover', e => e.preventDefault());
document.getElementById('workspace').addEventListener('drop', async e => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file?.type.startsWith('image/')) return;

    const imageUrl = await uploadImage(file);
    if (!imageUrl) return;

    const img = new Image();
    img.onload = () => {
        const stageBox = stage.container().getBoundingClientRect();
        const zoom = stage.scaleX();
        let x = (e.clientX - stageBox.left) / zoom;
        let y = (e.clientY - stageBox.top)  / zoom;
        let w = img.width;
        let h = img.height;
        if (w > 300) { h = h * (300 / w); w = 300; }

        // spawnElement('Image', loadData) を再利用し、ツールボタン経由と同一の
        // bladeData 構造（_pcGeom / layouts / events 等を含む）で生成する。
        // これでレスポンシブ出力やシリアライズの不整合を防ぐ。
        const count = incrementElementCount();
        const loadData = {
            id: 'image_' + count,
            transform: { x: x > 0 ? x : 50, y: y > 0 ? y : 50, width: w, height: h },
            properties: {
                name: '画像 ' + count, text: imageUrl,
                bgcolor: '#ffffff', color: '#000000', fontsize: 16,
                align: 'left', fontfamily: 'sans-serif', lock: false,
                route: '#', method: 'POST', event: 'none',
                shadow: 'none', animation: 'none', bgimage: '',
                layouts: {}, mobileEdited: false, visible: true, events: [],
            },
        };
        // loadData 指定時は spawnElement が自動選択/履歴保存をしないので、後で明示的に行う
        const newNode = spawnElement('Image', loadData, layer, false, true);
        applySelectedNodes([newNode]);
        saveHistory();
        showToast('画像を追加しました。');
    };
    img.src = imageUrl;
});

// ============================================================
// パネルドラッグ
// ============================================================
// 旧フローティングパネルのドラッグ処理は golden-layout 導入により無効化。
// （パネルは #panel-source 内で空になり、中身はペインへ移植済み）
document.querySelectorAll('.floating-panel.__disabled_old_panels').forEach(panel => {
    const header = panel.querySelector('.panel-header');
    if (!header) return;

    // ヘッダーに折りたたみボタンを動的に追加（テキストはspanで包む）
    if (!header.querySelector('.panel-collapse-btn')) {
        const titleText = header.textContent.trim();
        header.textContent = '';
        const titleSpan = document.createElement('span');
        titleSpan.textContent = titleText;
        titleSpan.style.flex = '1';
        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'panel-collapse-btn';
        collapseBtn.innerText = '−';
        collapseBtn.title = '折りたたみ / 展開';
        header.appendChild(titleSpan);
        header.appendChild(collapseBtn);

        // 折りたたみ時に元のサイズを覚えておく
        let savedSize = null;
        collapseBtn.onmousedown = e => e.stopPropagation(); // ヘッダードラッグと分離
        collapseBtn.onclick = e => {
            e.stopPropagation();
            const isCollapsed = panel.classList.toggle('collapsed');
            if (isCollapsed) {
                savedSize = { w: panel.style.width, h: panel.style.height };
                collapseBtn.innerText = '＋';
            } else {
                if (savedSize) {
                    if (savedSize.w) panel.style.width = savedSize.w;
                    if (savedSize.h) panel.style.height = savedSize.h;
                }
                collapseBtn.innerText = '−';
            }
        };
    }

    let pos3 = 0, pos4 = 0;

    header.onmousedown = e => {
        if (e.target.classList.contains('panel-collapse-btn')) return;
        e.preventDefault();
        document.querySelectorAll('.floating-panel').forEach(p => p.style.zIndex = 100);
        panel.style.zIndex = 101;
        pos3 = e.clientX; pos4 = e.clientY;

        document.onmouseup = () => {
            document.onmouseup   = null;
            document.onmousemove = null;
            clearSnapGuides();
            clearDockHighlight();
            applyFinalSnap(panel);
        };
        document.onmousemove = ev => {
            ev.preventDefault();
            const dx = pos3 - ev.clientX, dy = pos4 - ev.clientY;
            pos3 = ev.clientX; pos4 = ev.clientY;
            panel.style.top  = (panel.offsetTop  - dy) + 'px';
            panel.style.left = (panel.offsetLeft - dx) + 'px';
            // ドラッグ中: スナップ候補とドックゾーンを可視化
            showSnapGuides(panel);
            showDockHighlight(panel, ev.clientX);
        };
    };

    panel.addEventListener('mousedown', () => {
        document.querySelectorAll('.floating-panel').forEach(p => p.style.zIndex = 100);
        panel.style.zIndex = 101;
    });
});

// ============================================================
// パネルのスナップ・ドッキング補助関数
// ============================================================
const SNAP_T = 12;       // 吸着距離
const SCREEN_MARGIN = 20; // 画面端余白
const DOCK_TRIGGER = 40;  // 画面端からこの距離でドックゾーン発動

function getOtherPanels(self) {
    return Array.from(document.querySelectorAll('.floating-panel')).filter(p => p !== self);
}

function clearSnapGuides() {
    document.querySelectorAll('.snap-guide').forEach(g => g.remove());
}
function clearDockHighlight() {
    document.querySelectorAll('.dock-zone-highlight').forEach(d => d.remove());
}

// 吸着候補となるX/Y座標を集める
function collectSnapTargets(self) {
    const W = window.innerWidth, H = window.innerHeight;
    const xs = [SCREEN_MARGIN, W - SCREEN_MARGIN]; // 画面左端・右端
    const ys = [SCREEN_MARGIN, H - SCREEN_MARGIN]; // 画面上端・下端
    getOtherPanels(self).forEach(p => {
        const r = p.getBoundingClientRect();
        xs.push(r.left, r.right);
        ys.push(r.top, r.bottom);
    });
    return { xs, ys };
}

// ドラッグ中にスナップしそうな線を表示
function showSnapGuides(panel) {
    clearSnapGuides();
    const r = panel.getBoundingClientRect();
    const { xs, ys } = collectSnapTargets(panel);
    const H = window.innerHeight, W = window.innerWidth;

    // 左端・右端の吸着
    [['left', r.left], ['right', r.right]].forEach(([edge, val]) => {
        for (const tx of xs) {
            if (Math.abs(val - tx) <= SNAP_T) {
                const g = document.createElement('div');
                g.className = 'snap-guide vertical';
                g.style.left = tx + 'px'; g.style.top = '0'; g.style.height = H + 'px';
                document.body.appendChild(g);
                break;
            }
        }
    });
    // 上端・下端の吸着
    [['top', r.top], ['bottom', r.bottom]].forEach(([edge, val]) => {
        for (const ty of ys) {
            if (Math.abs(val - ty) <= SNAP_T) {
                const g = document.createElement('div');
                g.className = 'snap-guide horizontal';
                g.style.top = ty + 'px'; g.style.left = '0'; g.style.width = W + 'px';
                document.body.appendChild(g);
                break;
            }
        }
    });
}

// ドックゾーン(画面左右端)のハイライト
function showDockHighlight(panel, mouseX) {
    clearDockHighlight();
    const W = window.innerWidth;
    let side = null;
    if (mouseX <= DOCK_TRIGGER) side = 'left';
    else if (mouseX >= W - DOCK_TRIGGER) side = 'right';
    if (!side) return;

    const d = document.createElement('div');
    d.className = 'dock-zone-highlight';
    const panelW = panel.getBoundingClientRect().width;
    if (side === 'left') d.style.left = '0';
    else d.style.right = '0';
    d.style.width = Math.max(280, panelW) + 'px';
    document.body.appendChild(d);
    panel.dataset.dockSide = side;
}

// マウスを離した時に最終的な吸着・ドックを適用
function applyFinalSnap(panel) {
    const W = window.innerWidth, H = window.innerHeight;
    const r = panel.getBoundingClientRect();

    // ドックゾーンに入っていれば、その端の列に収納
    const dockSide = panel.dataset.dockSide;
    if (dockSide) {
        delete panel.dataset.dockSide;
        dockPanelToSide(panel, dockSide);
        return;
    }

    // 通常スナップ: 各辺を最も近い候補に吸着
    const { xs, ys } = collectSnapTargets(panel);
    let newLeft = r.left, newTop = r.top;

    // 左辺・右辺
    let bestDx = SNAP_T + 1, snapLeft = null;
    for (const tx of xs) {
        if (Math.abs(r.left - tx) < bestDx)  { bestDx = Math.abs(r.left - tx);  snapLeft = tx; }
        if (Math.abs(r.right - tx) < bestDx) { bestDx = Math.abs(r.right - tx); snapLeft = tx - r.width; }
    }
    if (snapLeft !== null) newLeft = snapLeft;

    // 上辺・下辺
    let bestDy = SNAP_T + 1, snapTop = null;
    for (const ty of ys) {
        if (Math.abs(r.top - ty) < bestDy)    { bestDy = Math.abs(r.top - ty);    snapTop = ty; }
        if (Math.abs(r.bottom - ty) < bestDy) { bestDy = Math.abs(r.bottom - ty); snapTop = ty - r.height; }
    }
    if (snapTop !== null) newTop = snapTop;

    panel.style.left = newLeft + 'px';
    panel.style.top  = newTop + 'px';
    panel.style.right = 'auto';
}

// パネルを画面端の列にドッキング（既存ドックパネルの下に積む）
function dockPanelToSide(panel, side) {
    const W = window.innerWidth;
    const panelW = Math.max(280, panel.getBoundingClientRect().width);

    // 同じ側に既にドックされているパネルを探して、その下に積む
    const docked = Array.from(document.querySelectorAll(`.floating-panel[data-docked="${side}"]`))
        .filter(p => p !== panel)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

    let topPos = SCREEN_MARGIN;
    if (docked.length > 0) {
        const last = docked[docked.length - 1].getBoundingClientRect();
        topPos = last.bottom + 8;
    }

    panel.style.width = panelW + 'px';
    panel.style.top   = topPos + 'px';
    if (side === 'left') {
        panel.style.left = SCREEN_MARGIN + 'px';
        panel.style.right = 'auto';
    } else {
        panel.style.left = (W - panelW - SCREEN_MARGIN) + 'px';
        panel.style.right = 'auto';
    }
    panel.dataset.docked = side;
}

// ============================================================
// 右クリック（コンテキストメニュー）の制御
// ============================================================
const contextMenu = document.getElementById('context-menu');
if (contextMenu) {
    stage.on('contextmenu', (e) => {
        e.evt.preventDefault();
        let node = e.target;
        if (node === stage) {
            applySelectedNodes([]);
        } else {
            if (node.getParent?.()?.className === 'Transformer') return;
            while (node.parent?.nodeType === 'Group' && node.parent.hasName('ui-element')) {
                node = node.parent;
            }
            if (node.hasName?.('ui-element') && !selectedNodes.includes(node)) {
                applySelectedNodes([node]);
            }
        }
        contextMenu.style.display = 'block';
        contextMenu.style.left = e.evt.clientX + 'px';
        contextMenu.style.top  = e.evt.clientY + 'px';
    });

    window.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });

    document.getElementById('menu-bring-front').onclick = () => {
        if (selectedNodes.length === 0) return;
        selectedNodes.forEach(node => node.moveToTop());
        tr.moveToTop();
        layer.batchDraw();
        renderExplorer();
        saveHistory();
    };

    document.getElementById('menu-send-back').onclick = () => {
        if (selectedNodes.length === 0) return;
        selectedNodes.forEach(node => node.moveToBottom());
        layer.batchDraw();
        renderExplorer();
        saveHistory();
    };

    document.getElementById('menu-copy').onclick    = copySelected;
    document.getElementById('menu-paste').onclick   = pasteClipboard;
    document.getElementById('menu-delete').onclick  = deleteSelectedNode;
    document.getElementById('menu-group').onclick   = groupNodes;
    document.getElementById('menu-ungroup').onclick = ungroupNodes;
}

// ============================================================
// Bladeテンプレートから呼ばれるグローバル関数をエクスポート
// ============================================================
export { groupNodes, ungroupNodes, deleteSelectedNode, saveAndExport, importJSON };

// ============================================================
// 【追加】ページエクスプローラーからリンク先URLへのD&D流し込み制御
// ============================================================
setTimeout(() => {
    const routeInput = document.getElementById('ins-route');
    if (routeInput) {
        // ドラッグが乗っかった時
        routeInput.addEventListener('dragover', (e) => {
            e.preventDefault();
            routeInput.style.borderColor = '#00a8ff';
            routeInput.style.backgroundColor = 'rgba(0, 168, 255, 0.1)';
        });

        // 離れた時
        routeInput.addEventListener('dragleave', () => {
            routeInput.style.borderColor = '#555';
            routeInput.style.backgroundColor = '#1e1e1e';
        });

        // ドロップされた時
        routeInput.addEventListener('drop', (e) => {
            e.preventDefault();
            routeInput.style.borderColor = '#555';
            routeInput.style.backgroundColor = '#1e1e1e';
            
            const pagePath = e.dataTransfer.getData('text/plain');
            if (pagePath && !pagePath.startsWith('data:image')) {
                // ドロップされたテキストをインプットに適用
                routeInput.value = pagePath;
                // インスペクターのデータ同期を呼び出して確定（履歴保存を走らせる）
                if (typeof onInspectorUpdate === 'function') {
                    onInspectorUpdate(true);
                }
                showToast(`リンク先を 「${pagePath}」 に設定しました。`);
            }
        });
    }
}, 500);