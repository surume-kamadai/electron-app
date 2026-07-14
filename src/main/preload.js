// ============================================================
// preload スクリプト / preload script
// レンダラー（HTML画面）に、安全なAPIだけを公開する橋渡し役。
// Bridge that exposes only a safe, minimal API to the renderer (HTML UI).
// window.electronAPI.xxx の形でHTML側から呼べるようになる。
// The renderer can then call it as window.electronAPI.xxx.
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // プロジェクト一式をディスクに書き出す / Write the whole project out to disk.
    exportProject: (payload) => ipcRenderer.invoke('export-project', payload),

    // 画像を選んでBase64で受け取る / Pick an image and receive it as Base64.
    pickImage: () => ipcRenderer.invoke('pick-image'),

    // Scene(JSON) の保存・読込 / Save and load the scene (JSON).
    saveScene: (jsonStr) => ipcRenderer.invoke('save-scene', jsonStr),
    loadScene: () => ipcRenderer.invoke('load-scene'),

    // ネイティブメニュー（ファイル/編集）からのアクションを受け取る
    // Receive actions from the native menu (File / Edit).
    onMenuAction: (callback) =>
        ipcRenderer.on('menu-action', (event, action) => callback(action)),

    // 「表示」メニューのパネル開閉トグルを受け取る
    // Receive panel show/hide toggles from the "View" menu.
    onTogglePanel: (callback) =>
        ipcRenderer.on('toggle-panel', (event, payload) => callback(payload)),

    // レンダラー側でパネルの開閉状態が変わったらメニューのチェックを同期させる
    // When a panel is opened/closed in the renderer, sync the menu checkbox.
    notifyPanelState: (id, open) =>
        ipcRenderer.send('panel-state-changed', { id, open }),
});
