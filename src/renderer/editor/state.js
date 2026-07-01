// ============================================================
// 共有ステート
// モジュール間で参照・更新する変数をここで一元管理する
// ============================================================

export let currentCanvasWidth  = 800;
export let currentCanvasHeight = 600;
export let selectedNodes       = [];
export let elementCount        = 0;
// 範囲選択 (Shift+クリック) の起点となる「最後にクリックされたノード」
export let lastClickedNode     = null;
export function setLastClickedNode(node) { lastClickedNode = node; }

export function setCurrentCanvasWidth(v)  { currentCanvasWidth  = v; }
export function setCurrentCanvasHeight(v) { currentCanvasHeight = v; }
export function setSelectedNodes(nodes)   { selectedNodes = nodes; }
export function incrementElementCount()   { elementCount++; return elementCount; }
export function setElementCount(v)         { elementCount = v; }
// --- デバイス（レスポンシブ）状態 ---
export let currentDevice = 'pc'; // 'pc' または 'mobile'
export function setCurrentDevice(v) { currentDevice = v; }