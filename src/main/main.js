// ============================================================
// Electron メインプロセス
// ウィンドウ生成 + ファイルシステム操作のIPC受け口
// （PHPを使わず、ここでディスクへ直接書き込む）
// ============================================================
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs   = require('fs/promises');

// 出力先(baseDir)の外へ書き込ませないための安全なパス結合。
// relPath に "../" 等が含まれ baseDir を抜け出す場合はエラーにする（パストラバーサル遮断）。
function safeResolve(baseDir, relPath) {
    const target = path.resolve(baseDir, relPath);
    const rel = path.relative(baseDir, target);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`不正な出力パスです: ${relPath}`);
    }
    return target;
}

const isDev = process.argv.includes('--dev');

let mainWindow;

// パネル定義（レンダラーの dock-layout.js と対応させる）
const PANEL_MENU = [
    { id: 'pane-tools',     label: 'ツール' },
    { id: 'pane-pages',     label: 'ページ' },
    { id: 'pane-explorer',  label: 'エクスプローラー' },
    { id: 'pane-canvas',    label: 'キャンバス' },
    { id: 'pane-settings',  label: 'プロジェクト設定' },
    { id: 'pane-inspector', label: 'プロパティ' },
];

function buildMenu() {
    const template = [
        {
            label: 'ファイル',
            submenu: [
                { label: '新規プロジェクト', click: () => mainWindow.webContents.send('menu-action', 'new-project') },
                { label: '開く...',         click: () => mainWindow.webContents.send('menu-action', 'open-project') },
                { label: '保存して書き出し', click: () => mainWindow.webContents.send('menu-action', 'save-export') },
                { type: 'separator' },
                { role: 'quit', label: '終了' },
            ]
        },
        {
            label: '編集',
            submenu: [
                { label: '元に戻す', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow.webContents.send('menu-action', 'undo') },
                { type: 'separator' },
                { role: 'cut',   label: '切り取り' },
                { role: 'copy',  label: 'コピー' },
                { role: 'paste', label: '貼り付け' },
            ]
        },
        {
            label: '表示',
            submenu: [
                ...PANEL_MENU.map(p => ({
                    label: p.label,
                    type: 'checkbox',
                    checked: true,
                    id: p.id,
                    click: (menuItem) => {
                        mainWindow.webContents.send('toggle-panel', { id: p.id, show: menuItem.checked });
                    }
                })),
                { type: 'separator' },
                { label: 'レイアウトを初期状態に戻す', click: () => mainWindow.webContents.send('menu-action', 'reset-layout') },
                { type: 'separator' },
                { role: 'reload', label: '再読み込み' },
                { role: 'toggleDevTools', label: '開発者ツール' },
            ]
        },
        {
            label: 'ヘルプ',
            submenu: [
                { label: 'バージョン情報', click: () => {
                    dialog.showMessageBox(mainWindow, {
                        type: 'info', title: 'Site Builder',
                        message: 'Site Builder', detail: 'GUIサイトビルダー',
                    });
                }},
            ]
        },
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    return menu;
}

// レンダラーから「パネルの開閉状態が変わった」と通知が来たら、メニューのチェックを同期
ipcMain.on('panel-state-changed', (event, { id, open }) => {
    const menu = Menu.getApplicationMenu();
    if (!menu) return;
    const item = menu.getMenuItemById(id);
    if (item) item.checked = open;
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            // セキュリティ: レンダラーからNode APIを直接触らせない
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    buildMenu();

    // セキュリティ: 外部URLへの遷移・新規ウィンドウ生成を禁止する。
    // 万一レンダラー内でリンク遷移が起きても、アプリのローカル画面が
    // 差し替えられたり任意サイトを読み込んだりしないようにする。
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // 外部リンクは既定ブラウザで開き、アプリ内には新規ウィンドウを作らない
        if (/^https?:\/\//.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        // ローカルファイル(file://)以外への遷移はブロック
        if (!url.startsWith('file://')) event.preventDefault();
    });

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ============================================================
// IPC: プロジェクト一式をディスクに書き出す
// renderer から { files: [{path, content}], images: [...] } を受け取る
// ============================================================

ipcMain.handle('export-project', async (event, payload) => {
    // レンダラー側から targetDir (上書き用のパス) が送られてきたらそれを使う
    let baseDir = payload.targetDir;
    
    if (!baseDir) {
        // 新規保存時はダイアログを出す
        const result = await dialog.showOpenDialog(mainWindow, {
            title: '保存先フォルダを選択',
            properties: ['openDirectory', 'createDirectory'],
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, message: 'キャンセルされました' };
        }
        // 選択されたフォルダ内にプロジェクト名のフォルダを作る
        baseDir = path.join(result.filePaths[0], payload.projectName || 'my-site');
    }

    try {
        // テキストファイル群（HTMLやJSONなど）を書き出す
        for (const file of payload.files) {
            const fullPath = safeResolve(baseDir, file.path);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, file.content, 'utf-8');
        }

        // 画像の保存
        for (const img of payload.images || []) {
            const fullPath = safeResolve(baseDir, img.path);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            const base64 = img.dataUrl.replace(/^data:image\/\w+;base64,/, '');
            await fs.writeFile(fullPath, Buffer.from(base64, 'base64'));
        }

        return { success: true, path: baseDir };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

// JSON(プロジェクト)読込時の戻り値を変更し、パスも返すようにする
ipcMain.handle('load-scene', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'プロジェクトを開く (project.json を選択)',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf-8');
    
    // 中身と、ファイルが置かれていた親ディレクトリのパスを返す
    return { content, dirPath: path.dirname(filePath) };
});

// ============================================================
// IPC: 画像ファイルを選んでBase64で返す
// （アップロードAPIの代わり。アプリ内ではメモリ保持し、出力時に書き出す）
// ============================================================
ipcMain.handle('pick-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: '画像を選択',
        properties: ['openFile'],
        filters: [{ name: '画像', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const buffer   = await fs.readFile(filePath);
    const ext      = path.extname(filePath).slice(1).toLowerCase();
    const mime     = ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext;
    const dataUrl  = `data:image/${mime};base64,${buffer.toString('base64')}`;

    return { dataUrl, name: path.basename(filePath) };
});

// ============================================================
// IPC: Scene(JSON) の保存・読込
// ============================================================
ipcMain.handle('save-scene', async (event, jsonStr) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'プロジェクトを保存',
        defaultPath: 'layout_project.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { success: false };
    await fs.writeFile(result.filePath, jsonStr, 'utf-8');
    return { success: true, path: result.filePath };
});