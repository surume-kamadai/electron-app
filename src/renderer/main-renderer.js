// ============================================================
// main-renderer.js - エディタ画面のエントリーポイント（マルチページ版）
// ============================================================
import { spawnElement, groupNodes, ungroupNodes, createEmptyFolder,spawnComponent } from './editor/elements.js';
import { onInspectorUpdate, deleteSelectedNode, alignNodes, distributeNodes } from './editor/inspector.js';
import { saveAndExport, importJSON, startAutoSave } from './editor/api.js';
import { renderExplorer } from './editor/explorer.js';
import { saveHistory, clearPageHistory, undo, redo } from './editor/history.js';
import { enterWarpMode, exitWarpMode } from './editor/warp.js';
import { selectedNodes } from './editor/state.js';
import { switchDevice } from './editor/display.js';
import { playPreview, stopPreview } from './editor/preview.js';


// マルチページ・設定
import { renderPages, onAddPage, onAddFolder } from './editor/pages-ui.js';
import { newProject, initProject, getPages, getFolders } from './editor/project.js';
import { initDockLayout, showPanel, hidePanel } from './editor/dock-layout.js';
import { initCanvasPreview } from './editor/canvas-preview.js';
import { initOffscreenIndicators } from './editor/offscreen.js';
import { initRulers, toggleRulers } from './editor/rulers.js';
import { initGradientOverlay } from './editor/gradient-overlay.js';
import { initColorPickers } from './editor/color-picker.js';
import {
    onProjectNameChange, onOutputTypeChange,
    onCanvasSizeChange, initSettingsUI,
    updateSiteBgColor, updatePageBgColor, clearPageBgColor, syncBgColorUI,
    updateSiteSeo, updatePageSeo,
} from './editor/settings-ui.js';

// events.js は副作用としてイベントリスナーを登録する
import './editor/events.js';

// --- 要素操作 ---
window.spawnElement       = spawnElement;
window.groupNodes         = groupNodes;
window.ungroupNodes       = ungroupNodes;
window.onInspectorUpdate  = onInspectorUpdate;
window.deleteSelectedNode = deleteSelectedNode;
window.renderExplorer     = renderExplorer;
window.spawnComponent     = spawnComponent;

// --- キャンバス設定（プロジェクトに同期する版に差し替え）---
window.switchDevice = switchDevice;
window.playPreview  = playPreview;
window.stopPreview  = stopPreview;
window.toggleRulers = toggleRulers;
window.updateCanvasSize   = onCanvasSizeChange;
window.alignNodes         = alignNodes;
window.distributeNodes    = distributeNodes;

// --- プロジェクト設定 ---
window.onProjectNameChange = onProjectNameChange;
window.onOutputTypeChange  = onOutputTypeChange;
window.updateSiteBgColor   = updateSiteBgColor;
window.updatePageBgColor   = updatePageBgColor;
window.clearPageBgColor    = clearPageBgColor;
window.__syncBgColorUI     = syncBgColorUI;
window.updateSiteSeo       = updateSiteSeo;
window.updatePageSeo       = updatePageSeo;

// --- 履歴（元に戻す / やり直し）---
window.undo = undo;
window.redo = redo;


// --- ページ操作 ---
window.addPage = onAddPage;
window.addPageFolder = onAddFolder;

// --- エクスプローラー: 空フォルダ追加 ---
window.createEmptyFolder = createEmptyFolder;

// --- プロジェクト保存・読込 ---
window.saveAndExport = saveAndExport;
window.importJSON = importJSON;

window.newProject = () => {
    if (confirm('新規プロジェクトを作成しますか？（未保存の変更は失われます）')) {
        clearPageHistory();  // 全ページの履歴をリセット
        newProject();
        initSettingsUI();
        renderPages();
        renderExplorer();
        saveHistory();
    }
};

// --- 出力 ---（saveAndExport が統合保存と出力を兼ねるので、ここはそれを使う）
window.exportStatic  = () => saveAndExport();
window.exportLaravel = () => saveAndExport();

// --- 台形変形（パースペクティブ）モード切替 ---
window.toggleWarpMode = () => {
    if (selectedNodes.length === 1) {
        enterWarpMode(selectedNodes[0]);
    } else {
        exitWarpMode();
    }
};

// --- 循環参照解消: project.js に spawnElement と renderExplorer を登録 ---
initProject(spawnElement, renderExplorer);

// --- スライダー編集モーダル用: ページ一覧（path と名前）を返す ---
window.__getProjectPagesForSlider = () => {
    const folders = getFolders();
    const folderMap = new Map(folders.map(f => [f.id, f.name]));
    return getPages().map(p => {
        const fname = folderMap.get(p.folderId);
        const path = fname ? `${fname}/${p.name}.html` : `${p.name}.html`;
        return { name: path, path };
    });
};

// --- 初期化 ---
initSettingsUI();
renderPages();

// --- ドッキングレイアウト初期化（パネルをペインに移植）---
// golden-layout がDOMを移動するので、他の初期化の後に実行する
initDockLayout(() => {
    // ペインのリサイズ時: golden-layoutのレイアウト計算だけ更新（ステージは固定サイズ）
    // 必要ならここでステージ位置の微調整も可能
});

// --- ネイティブメニュー（main.js）からの「表示」パネルトグルを受ける ---
if (window.electronAPI?.onTogglePanel) {
    window.electronAPI.onTogglePanel(({ id, show }) => {
        if (show) showPanel(id);
        else hidePanel(id);
    });
}
// ファイル/編集メニューのアクション
if (window.electronAPI?.onMenuAction) {
    window.electronAPI.onMenuAction((action) => {
        switch (action) {
            case 'new-project':  window.newProject?.();   break;
            case 'open-project': window.importJSON?.();   break;
            case 'save-export':  window.exportStatic?.();  break;
            case 'undo':         window.undo?.();          break;
            case 'redo':         window.redo?.();          break;
            case 'reset-layout': window.location.reload(); break;
        }
    });
}

// --- テンプレート編集モーダルのボタンを直接配線 ---
// （golden-layout のペイン移植後も onclick が確実に効くよう、addEventListener で繋ぐ）
function wireEditorButtons() {
    const wire = (btnId, fnName) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof window[fnName] === 'function') window[fnName]();
            });
        }
    };
    wire('btn-open-slider-editor',    'openSliderEditor');
    wire('btn-open-grid-editor',      'openGridEditor');
    wire('btn-open-accordion-editor', 'openAccordionEditor');
}
// golden-layoutの移植が終わったタイミングで配線（少し遅延）
setTimeout(() => {
    wireEditorButtons();
    initCanvasPreview();        // Slider/Grid/Accordion の実物プレビュー層を起動
    initOffscreenIndicators();  // 画面外要素の位置マーカー層を起動
    initRulers();               // 定規＆ガイド層を起動
    initGradientOverlay();      // 画像グラデーションのオーバーレイ層を起動
    initColorPickers();         // アルファ対応(RGBA)カラーピッカーを配線
    // モーダルを確実に body 直下へ移動（隠しコンテナ等に巻き込まれない保険）
    ['slider-editor-overlay', 'accordion-editor-overlay', 'preview-overlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.parentElement !== document.body) {
            document.body.appendChild(el);
        }
    });
}, 500);

setTimeout(() => saveHistory(), 100);
startAutoSave(); // ★ ここでオートセーブを開始する