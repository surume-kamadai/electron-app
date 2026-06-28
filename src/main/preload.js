// ============================================================
// preload スクリプト
// レンダラー（HTML画面）に、安全なAPIだけを公開する橋渡し役
// window.electronAPI.xxx の形でHTML側から呼べるようになる
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // プロジェクト一式をディスクに書き出す
    exportProject: (payload) => ipcRenderer.invoke('export-project', payload),

    // 画像を選んでBase64で受け取る
    pickImage: () => ipcRenderer.invoke('pick-image'),

    // Scene(JSON) の保存・読込
    saveScene: (jsonStr) => ipcRenderer.invoke('save-scene', jsonStr),
    loadScene: () => ipcRenderer.invoke('load-scene'),
});
