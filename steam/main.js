// 火柴建築師 Steam 桌面版：一個視窗載入完整版（app/index.html，由 build.sh 從 dist/steam/index.html 複製進來）。
// Steam 版是買斷制：遊戲裡沒有廣告、沒有內購（src/edition.js 的 'steam' 版本）。
//   F11 或 Alt+Enter：全螢幕切換。外部連結用系統瀏覽器開。存檔（localStorage）放在 Electron 的使用者資料夾。
//   electron . --smoke：不顯示視窗，載入後確認標題畫面出現，印出結果並截圖到 release/smoke.png 後結束（測試用）。
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const SMOKE = process.argv.includes('--smoke');
app.setName('Match Architect');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600, show: !SMOKE,
    backgroundColor: '#a9daf2', title: 'Match Architect · 火柴建築師', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: !SMOKE },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // links (e.g. the credits) open in the player's browser, never inside the game window
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  if (SMOKE) smoke(win);
}

async function smoke(win) {
  const fail = msg => { console.log('SMOKE FAIL ' + msg); app.exit(1); };
  setTimeout(() => fail('timeout'), 60000);
  win.webContents.on('console-message', (...a) => { const m = a[0] && a[0].message !== undefined ? a[0] : { level: a[1], message: a[2] }; if (m.level === 'error' || m.level === 3) console.log('console error:', m.message); });
  await new Promise(r => win.webContents.once('did-finish-load', r));
  for (let i = 0; i < 100; i++) {
    const s = await win.webContents.executeJavaScript(`(() => { const t = document.getElementById('ovTitle'); return { title: !!t && !t.hidden, lang: document.documentElement.lang, credit: !!document.querySelector('[data-t="title.credit"]'), jam: !!document.querySelector('[data-t="title.jam"]') }; })()`);
    if (s.title) {
      const img = await win.webContents.capturePage();
      fs.mkdirSync(path.join(__dirname, 'release'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, 'release', 'smoke.png'), img.toPNG());
      console.log('SMOKE OK ' + JSON.stringify(s));
      app.exit(s.jam ? 1 : 0);
      return;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  fail('title screen never showed');
}

if (process.platform === 'darwin') {
  // keep the standard macOS app menu so ⌘Q, ⌘H and ⌘M work; no other menus
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'windowMenu' }]));
} else {
  Menu.setApplicationMenu(null);
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
