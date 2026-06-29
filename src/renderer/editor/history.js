// ============================================================
// 履歴 (Undo) 管理 - ページごとに独立した履歴を持つ
// ============================================================
import { layer, tr } from './canvas.js';
import { setSelectedNodes } from './state.js';
import { generateSceneData } from './converter.js';
import { hideInspector } from './inspector.js';
import { renderExplorer } from './explorer.js';
import { spawnElement } from './elements.js';
import { getActivePageId } from './project.js';

const HISTORY_LIMIT = 50;

// ページIDごとに { states: [], index: -1 } を持つ
const pageHistories = new Map();
let isUndoOperation = false;

function getCurrentHistory() {
    const pageId = getActivePageId();
    if (!pageId) return null;
    if (!pageHistories.has(pageId)) {
        pageHistories.set(pageId, { states: [], index: -1 });
    }
    return pageHistories.get(pageId);
}

export function saveHistory() {
    if (isUndoOperation) return;
    const hist = getCurrentHistory();
    if (!hist) return;

    const currentState = generateSceneData(false).elements;
    hist.states = hist.states.slice(0, hist.index + 1);
    hist.states.push(JSON.stringify(currentState));

    if (hist.states.length > HISTORY_LIMIT) {
        hist.states.shift();
        hist.index--;
    }
    hist.index++;
}

export function undo() {
    const hist = getCurrentHistory();
    if (!hist || hist.index <= 0) return;
    hist.index--;
    isUndoOperation = true;
    loadFromState(JSON.parse(hist.states[hist.index]));
    isUndoOperation = false;
}

export function redo() {
    const hist = getCurrentHistory();
    if (!hist || hist.index >= hist.states.length - 1) return;
    hist.index++;
    isUndoOperation = true;
    loadFromState(JSON.parse(hist.states[hist.index]));
    isUndoOperation = false;
}

function loadFromState(elementsData) {
    layer.find('.ui-element').forEach(n => n.destroy());
    setSelectedNodes([]);
    tr.nodes([]);
    hideInspector();
    elementsData.forEach(el => spawnElement(el.type, el, layer, true));
    layer.batchDraw();
    renderExplorer();
}

// ページ削除・新規プロジェクト時に履歴を消すための関数
export function clearPageHistory(pageId) {
    if (pageId) pageHistories.delete(pageId);
    else pageHistories.clear();
}