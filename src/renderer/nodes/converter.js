// ============================================================
// JSONシリアライズ / JSON serialization
// Konvaノードをシーンデータ(JSON)に変換する。
// Converts Konva nodes into scene data (JSON).
// ============================================================
import { currentCanvasWidth, currentCanvasHeight, currentDevice } from '../app/state.js';
import { layer } from '../canvas/canvas.js';
import { saveCurrentDeviceLayout } from '../canvas/display.js';

/**
 * Konvaノードを再帰的にシリアライズする。
 * ノードの現在位置を transform として保存する。
 * （スマホ表示中は呼び出し元が一時的にPC配置に戻してから処理する）
 *
 * Recursively serialize a Konva node, saving its current position as `transform`.
 * (While in mobile view, the caller temporarily restores PC layout first.)
 */
export function processNode(node) {
    const type   = node.getAttr('uiType');
    const bData  = node.getAttr('bladeData');
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const w = type === 'Group' ? node.width()  : node.width()  * scaleX;
    const h = type === 'Group' ? node.height() : node.height() * scaleY;

    // Circle/Triangle は中心座標なので左上座標に変換して保存
    // Circle/Triangle use a center origin, so convert to top-left before saving.
    let x = Math.round(node.x());
    let y = Math.round(node.y());
    if (type === 'Circle') {
        x = Math.round(node.x() - node.radiusX());
        y = Math.round(node.y() - node.radiusY());
    }

    const data = {
        id:         node.id(),
        type,
        transform:  { x, y, width: Math.round(w), height: Math.round(h) },
        properties: JSON.parse(JSON.stringify(bData)),
    };

    if (type === 'Group') {
        data.children = node.getChildren()
            .filter(c => c.hasName('ui-element'))
            .map(c => processNode(c));
    }

    return data;
}

// スマホ表示中の各ノードを一時的にPC配置（transform）に戻すヘルパ。
// Helper that temporarily restores each node to its PC layout (transform) while in mobile view.
// 戻り値: 元のスマホ位置を保持した配列（後で元に戻すため）
// Returns an array holding the original mobile positions (to restore afterward).
function temporarilyRestorePcLayout() {
    const snapshots = [];
    layer.getChildren().forEach(node => {
        if (!node.hasName('ui-element')) return;
        collectAndRestore(node, snapshots);
    });
    return snapshots;
}

function collectAndRestore(node, snapshots) {
    const type = node.getAttr('uiType');
    // 今のスマホ表示中の位置を退避 / Stash the current (mobile-view) position.
    const snap = { node, x: node.x(), y: node.y(), w: node.width(), h: node.height() };
    if (type === 'Circle') { snap.rx = node.radiusX(); snap.ry = node.radiusY(); }
    snapshots.push(snap);

    // PC配置の正データを探す: 起動直後の transform(=シーンデータ load 時の値) は
    // ノードには記録されていないため、bData.layouts.mobile が無い要素は今の値が
    // 既にPC配置と一致している。mobile編集された要素については、ロード時点で
    // node の x/y は PC値だったはずなので、display.js の syncNodeToLayout がスマホ
    // 値に書き換える前の値を bData.layouts._pcBackup に持たせる…という仕掛けはまだ
    // 入れていない。ここでは「ロード時/PC編集時の transform 値」を node から取得
    // できないため、別策として bData.layouts.mobile が存在する場合のみ、PC値を
    // 保存しておく仕組みが必要。
    // 簡易策: bData._pcGeom があれば復元、無ければそのまま（PC配置と一致）。
    // Simple approach: restore from bData._pcGeom if present; otherwise leave as-is (already PC layout).
    const bData = node.getAttr('bladeData');
    if (bData && bData._pcGeom) {
        const pc = bData._pcGeom;
        if (type === 'Circle') {
            node.radiusX(pc.w / 2); node.radiusY(pc.h / 2);
            node.x(pc.x + pc.w / 2); node.y(pc.y + pc.h / 2);
        } else {
            node.x(pc.x); node.y(pc.y); node.width(pc.w); node.height(pc.h);
        }
    }

    if (type === 'Group') {
        node.getChildren().forEach(c => {
            if (c.hasName('ui-element')) collectAndRestore(c, snapshots);
        });
    }
}

function restoreFromSnapshots(snapshots) {
    snapshots.forEach(s => {
        const type = s.node.getAttr('uiType');
        if (type === 'Circle') {
            s.node.radiusX(s.rx); s.node.radiusY(s.ry);
            s.node.x(s.x); s.node.y(s.y);
        } else {
            s.node.x(s.x); s.node.y(s.y); s.node.width(s.w); s.node.height(s.h);
        }
    });
}

/**
 * ステージ全体をシリアライズしてシーンデータを返す。
 * Serialize the whole stage and return the scene data.
 */
export function generateSceneData(includeCanvas = true) {
    // スマホ表示中なら、まず現在の見た目を layouts.mobile に保存（ユーザー編集分の念のための退避）
    // If in mobile view, first save the current look into layouts.mobile (safeguard the user's edits).
    saveCurrentDeviceLayout();

    // スマホ表示中は、保存処理の間だけノードをPC配置に戻す
    // While in mobile view, restore nodes to PC layout just for the duration of saving.
    let snapshots = null;
    if (currentDevice === 'mobile') {
        snapshots = temporarilyRestorePcLayout();
    }

    // canvas サイズは常にPC基準 / Canvas size is always the PC baseline.
    let cw = currentCanvasWidth, ch = currentCanvasHeight;
    if (currentDevice === 'mobile') {
        cw = parseInt(document.getElementById('canvas-width')?.value)  || 800;
        ch = parseInt(document.getElementById('canvas-height')?.value) || 600;
    }

    const data = includeCanvas
        ? { canvas: { width: cw, height: ch }, elements: [] }
        : { elements: [] };

    layer.getChildren().forEach(child => {
        if (child.hasName('ui-element')) data.elements.push(processNode(child));
    });

    // スマホ表示に戻す / Restore the mobile view.
    if (snapshots) restoreFromSnapshots(snapshots);

    return data;
}