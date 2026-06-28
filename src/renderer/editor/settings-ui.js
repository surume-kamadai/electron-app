// ============================================================
// settings-ui.js - プロジェクト設定パネルの連携
// プロジェクト名・キャンバスサイズ・出力タイプを project.js に反映
// ============================================================
import { updateSettings, updateCanvasSetting, getSettings, getActivePage } from './project.js';
import { updateCanvasSize } from './display.js';

// エディタのキャンバス地色に、現在ページの実効背景色を反映
function applyCanvasBgPreview() {
    const s = getSettings();
    const page = getActivePage();
    const effective = (page && page.bgColor) ? page.bgColor : (s.siteBgColor || '#f1f2f6');
    const container = document.getElementById('canvas-container');
    if (container) container.style.backgroundColor = effective;
}

// サイト全体の背景色変更
export function updateSiteBgColor() {
    const el = document.getElementById('site-bg-color');
    if (!el) return;
    updateSettings({ siteBgColor: el.value });
    applyCanvasBgPreview();
    refreshPageBgStatus();
}

// このページの背景色変更（個別指定）
export function updatePageBgColor() {
    const el = document.getElementById('page-bg-color');
    const page = getActivePage();
    if (!el || !page) return;
    page.bgColor = el.value;
    applyCanvasBgPreview();
    refreshPageBgStatus();
}

// ページ個別指定を解除（サイト全体に従う）
export function clearPageBgColor() {
    const page = getActivePage();
    if (!page) return;
    page.bgColor = '';
    const s = getSettings();
    const picker = document.getElementById('page-bg-color');
    if (picker) picker.value = s.siteBgColor || '#f1f2f6';
    applyCanvasBgPreview();
    refreshPageBgStatus();
}

// 「このページは個別指定中／サイト設定に従う」の表示
function refreshPageBgStatus() {
    const status = document.getElementById('page-bg-status');
    const page = getActivePage();
    if (!status || !page) return;
    if (page.bgColor) {
        status.innerText = '※ このページは個別の背景色を使用中';
        status.style.color = '#4ec94e';
    } else {
        status.innerText = '※ サイト全体の背景色に従っています';
        status.style.color = '#888';
    }
}

// ページ切替時などに、背景色UIを現在ページに合わせて更新
export function syncBgColorUI() {
    const s = getSettings();
    const page = getActivePage();
    const siteEl = document.getElementById('site-bg-color');
    const pageEl = document.getElementById('page-bg-color');
    if (siteEl) siteEl.value = s.siteBgColor || '#f1f2f6';
    if (pageEl) pageEl.value = (page && page.bgColor) ? page.bgColor : (s.siteBgColor || '#f1f2f6');
    applyCanvasBgPreview();
    refreshPageBgStatus();
}

// プロジェクト名の変更
export function onProjectNameChange() {
    const el = document.getElementById('project-name');
    if (el) updateSettings({ projectName: el.value.trim() || 'my-site' });
}

// 出力タイプの変更（static / laravel）
export function onOutputTypeChange() {
    const el = document.getElementById('output-type');
    if (el) updateSettings({ outputType: el.value });
}

// キャンバスサイズ変更時に設定へ同期（display.js の updateCanvasSize も呼ぶ）
export function onCanvasSizeChange() {
    updateCanvasSize();   // 見た目を更新
    const w = parseInt(document.getElementById('canvas-width').value)  || 800;
    const h = parseInt(document.getElementById('canvas-height').value) || 600;
    const mw = parseInt(document.getElementById('canvas-mobile-width').value)  || 375;
    const mh = parseInt(document.getElementById('canvas-mobile-height').value) || 800;
    updateCanvasSetting(w, h, mw, mh);   // プロジェクト設定へ保存
}

// 起動時：設定値をUIに反映
export function initSettingsUI() {
    const s = getSettings();
    const pn = document.getElementById('project-name');
    const ot = document.getElementById('output-type');
    if (pn) pn.value = s.projectName;
    if (ot) ot.value = s.outputType;
    document.getElementById('canvas-width').value  = s.canvas.width;
    document.getElementById('canvas-height').value = s.canvas.height;
    const mw = document.getElementById('canvas-mobile-width');
    const mh = document.getElementById('canvas-mobile-height');
    if (mw) mw.value = s.canvas.mobileWidth  ?? 375;
    if (mh) mh.value = s.canvas.mobileHeight ?? 800;
    syncBgColorUI();
}