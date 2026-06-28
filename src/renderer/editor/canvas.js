// ============================================================
// Konva キャンバス初期化
// stage / layer / transformer / selectionRect を生成してエクスポートする
// ============================================================
import { currentCanvasWidth, currentCanvasHeight } from './state.js';

export const stage = new Konva.Stage({
    container: 'canvas-container',
    width:  currentCanvasWidth,
    height: currentCanvasHeight,
});

export const layer = new Konva.Layer();
stage.add(layer);

export const tr = new Konva.Transformer({
    keepRatio: false,
    enabledAnchors: [
        'top-left', 'top-center', 'top-right',
        'middle-left', 'middle-right',
        'bottom-left', 'bottom-center', 'bottom-right',
    ],
    rotateEnabled: true,
});
layer.add(tr);

export const selectionRect = new Konva.Rect({
    fill: 'rgba(0, 168, 255, 0.3)',
    visible: false,
    listening: false,
});
layer.add(selectionRect);