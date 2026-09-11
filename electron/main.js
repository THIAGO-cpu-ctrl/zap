// ZapFamily Desktop — servidor local OU remoto (web e app no mesmo mundo!)
const { app, BrowserWindow, dialog, shell, Menu, clipboard, ipcMain } = require('electron');
const path = require('path');
const net = require('net');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}
function isPortFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}

let win = null;
let serverURL = '';
let remoteMode = false;

// Servidor público padrão (mesmo mundo para todo mundo!). Vazio = modo local.
const DEFAULT_SERVER = 'https://zapfamily.onrender.com';

function serverCfgPath() { return path.join(app.getPath('userData'), 'server.json'); }
function loadCfg() {
  try { return JSON.parse(fs.readFileSync(serverCfgPath(), 'utf-8')) || {}; } catch (e) { return {}; }
}
function cleanURL(u) {
  u = String(u || '').trim().replace(/\/+$/, '');
  return /^https?:\/\/.+/.test(u) ? u : '';
}
// testa se um servidor ZapFamily responde (sem estar logado, /api/me dá 401 = vivo!)
function pingServer(url) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https:') ? https : http;
      const req = lib.get(url + '/api/me', { timeout: 8000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 401 || res.statusCode === 200);
      });
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.on('error', () => resolve(false));
    } catch (e) { resolve(false); }
  });
}

function getLanIP() {
  try {
    const nets = os.networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const n of (list || [])) {
        if (n.family === 'IPv4' && !n.internal) return n.address;
      }
    }
  } catch (e) {}
  return null;
}
function phoneURL() {
  if (remoteMode) return serverURL;
  const ip = getLanIP();
  if (!ip) return '';
  try { return 'http://' + ip + ':' + new URL(serverURL).port; } catch (e) { return ''; }
}
function buildMenu() {
  const template = [
    {
      label: 'ZapFamily',
      submenu: [
        {
          label: remoteMode ? '🌐 Servidor: ' + serverURL : '🏠 Servidor: local (só este PC)',
          enabled: false
        },
        {
          label: '🌐 Abrir no navegador (para usar uma 2ª conta)',
          click: () => shell.openExternal(serverURL)
        },
        {
          label: '📋 Copiar endereço do servidor',
          click: () => {
            clipboard.writeText(serverURL);
            dialog.showMessageBox(win, { title: 'ZapFamily', message: 'Endereço copiado:\n' + serverURL });
          }
        },
        {
          label: '📱 Endereço para o celular (mesmo Wi-Fi)',
          click: () => {
            const u = phoneURL();
            if (!u) { dialog.showMessageBox(win, { title: 'ZapFamily', message: 'Não achei um IP de rede. Conecte o PC no Wi-Fi e tente de novo.' }); return; }
            clipboard.writeText(u);
            dialog.showMessageBox(win, { title: 'ZapFamily', message: 'Endereço copiado! 📋\n' + u + '\n\nNo app do celular (mesmo Wi-Fi): menu ⋮ → 🔗 Servidor → cole e conecte.' });
          }
        },
        { type: 'separator' },
        { label: '🔗 Conectar a um servidor...', click: () => openConnectDialog() },
        {
          label: '🌐 Usar servidor padrão',
          click: () => {
            try { fs.unlinkSync(serverCfgPath()); } catch (e) {}
            app.relaunch(); app.exit(0);
          }
        },
        {
          label: '🏠 Voltar ao servidor local',
          click: () => {
            const c = loadCfg();
            if (!remoteMode && c.local) {
              dialog.showMessageBox(win, { title: 'ZapFamily', message: 'Você já está no servidor local.' });
              return;
            }
            try { fs.writeFileSync(serverCfgPath(), JSON.stringify({ local: true })); } catch (e) {}
            app.relaunch(); app.exit(0);
          }
        },
        { type: 'separator' },
        { label: '🔄 Recarregar', click: () => { if (win) win.reload(); } },
        {
          label: 'ℹ️ Sobre',
          click: () => dialog.showMessageBox(win, {
            title: 'ZapFamily',
            message: 'ZapFamily — sua rede social 💬\n\nServidor: ' + serverURL +
              (remoteMode ? '  (remoto — mesmo mundo da web! 🌐)' : '  (local — só este PC)') +
              '\nDados salvos em: ' + (remoteMode ? 'no servidor remoto' : app.getPath('userData')) +
              '\n\nDica: clique em "Abrir no navegador" para criar uma 2ª conta e conversar entre elas!'
          })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function openConnectDialog() {
  if (!win) return;
  const dlg = new BrowserWindow({
    parent: win, modal: true, width: 460, height: 230, resizable: false,
    title: 'Conectar a um servidor',
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  dlg.setMenu(null);
  const html = '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px 18px">'
    + '<h3 style="margin:0 0 8px">🔗 Conectar a um servidor</h3>'
    + '<p style="font-size:13px;color:#444">Cole o endereço do ZapFamily na internet<br>(ex: https://meu-zap.onrender.com). O app e a web passam a ver as <b>mesmas</b> contas e conversas!</p>'
    + '<input id="u" type="text" placeholder="https://..." style="width:100%;padding:8px;font-size:14px;box-sizing:border-box">'
    + '<div style="margin-top:12px;text-align:right"><button id="ok" style="padding:8px 20px;font-size:14px">Conectar</button></div>'
    + '<script>const {ipcRenderer}=require("electron");'
    + 'document.getElementById("ok").onclick=()=>{ipcRenderer.send("zf-connect-url",document.getElementById("u").value);};'
    + 'document.getElementById("u").onkeydown=(e)=>{if(e.key==="Enter")document.getElementById("ok").click();};'
    + 'document.getElementById("u").focus();</script></body></html>';
  dlg.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  ipcMain.removeAllListeners('zf-connect-url');
  ipcMain.on('zf-connect-url', async (ev, url) => {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/.+\..+/.test(url)) {
      dialog.showErrorBox('ZapFamily', 'Endereço inválido. Use algo como:\nhttps://meu-zap.onrender.com');
      return;
    }
    const ok = await pingServer(url);
    if (!ok) {
      dialog.showErrorBox('ZapFamily', 'Não consegui falar com:\n' + url + '\n\nConfira o endereço e se o servidor está no ar.\n(Servidores gratuitos podem demorar ~1 min na primeira vez.)');
      return;
    }
    try { fs.writeFileSync(serverCfgPath(), JSON.stringify({ url })); } catch (e) {}
    app.relaunch(); app.exit(0);
  });
  dlg.on('closed', () => ipcMain.removeAllListeners('zf-connect-url'));
}

async function start() {
  await app.whenReady();
  // permite microfone (áudios) e afins no app desktop
  try {
    require('electron').session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(true));
  } catch (e) {}

  // pasta de dados do usuário
  const userData = app.getPath('userData');
  try { fs.mkdirSync(userData, { recursive: true }); } catch (e) {}

  // qual servidor usar? 1) escolha do usuário 2) padrão de fábrica 3) local
  const cfg = loadCfg();
  const userURL = cfg.local ? '' : cleanURL(cfg.url);
  const wantRemote = userURL || (!cfg.local && cleanURL(DEFAULT_SERVER));
  const isDefault = !userURL && !!wantRemote;
  if (wantRemote) {
    if (await pingServer(wantRemote)) {
      serverURL = wantRemote;
      remoteMode = true;
    } else {
      const buttons = isDefault
        ? ['Tentar de novo', 'Usar servidor local']
        : ['Tentar de novo', 'Usar servidor local desta vez', 'Esquecer servidor e usar local'];
      const choice = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'ZapFamily',
        message: 'Não consegui conectar ao servidor:\n' + wantRemote,
        buttons, defaultId: 0, cancelId: 1
      });
      if (choice === 0) { app.relaunch(); app.exit(0); return; }
      if (!isDefault && choice === 2) { try { fs.unlinkSync(serverCfgPath()); } catch (e) {} }
    }
  }

  if (!remoteMode) {
    // mantém as contas do ZapSocial antigo (mesma pasta de antes do rebrand)
    const legacyData = path.join(app.getPath('appData'), 'ZapSocial');
    const dataDir = fs.existsSync(path.join(legacyData, 'data.json')) ? legacyData : userData;
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
    process.env.ZAP_DATA = path.join(dataDir, 'data.json');
    process.env.ZAP_SESS = path.join(dataDir, 'sessions');

    // porta fixa 3000 (se livre) — facilita abrir no navegador
    let port = 3000;
    if (!(await isPortFree(3000))) port = await getFreePort();
    process.env.PORT = String(port);
    serverURL = 'http://127.0.0.1:' + port;

    // sobe o servidor do ZapFamily
    const serverPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar', 'server.js')
      : path.join(__dirname, '..', 'server.js');
    require(serverPath);
  }

  // ícone da janela (personalizado pelo usuário, ou o padrão)
  let winIcon, savedTitle = '';
  try {
    const custom = path.join(userData, 'app-icon.png');
    const p = path.join(__dirname, '..', 'assets', 'icon.png');
    if (fs.existsSync(custom)) winIcon = custom;
    else if (fs.existsSync(p)) winIcon = p;
    const prefs = JSON.parse(fs.readFileSync(path.join(userData, 'zf-prefs.json'), 'utf-8'));
    if (prefs && prefs.title) savedTitle = String(prefs.title).slice(0, 60);
  } catch (e) {}

  // abre a janela do app
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: (savedTitle || 'ZapFamily') + (remoteMode ? ' 🌐' : ''),
    backgroundColor: '#075E54',
    ...(winIcon ? { icon: winIcon } : {}),
    webPreferences: { devTools: false, preload: path.join(__dirname, 'preload.js') }
  });
  buildMenu();
  win.loadURL(serverURL);

  // links externos abrem no navegador de verdade
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ícone e título personalizáveis pelo app
  ipcMain.removeHandler('zf-set-icon');
  ipcMain.handle('zf-set-icon', async (ev, dataURL) => {
    try {
      const m = String(dataURL).match(/^data:image\/png;base64,(.+)$/);
      if (!m) return false;
      fs.writeFileSync(path.join(userData, 'app-icon.png'), Buffer.from(m[1], 'base64'));
      if (win) win.setIcon(path.join(userData, 'app-icon.png'));
      return true;
    } catch (e) { return false; }
  });
  ipcMain.removeHandler('zf-reset-icon');
  ipcMain.handle('zf-reset-icon', async () => {
    try { fs.unlinkSync(path.join(userData, 'app-icon.png')); } catch (e) {}
    try {
      const p = path.join(__dirname, '..', 'assets', 'icon.png');
      if (win && fs.existsSync(p)) win.setIcon(p);
    } catch (e) {}
    return true;
  });
  ipcMain.removeHandler('zf-set-title');
  ipcMain.handle('zf-set-title', async (ev, title) => {
    try {
      title = String(title || '').slice(0, 60);
      fs.writeFileSync(path.join(userData, 'zf-prefs.json'), JSON.stringify({ title }));
      if (win) win.setTitle((title || 'ZapFamily') + (remoteMode ? ' 🌐' : ''));
      return true;
    } catch (e) { return false; }
  });

  win.on('closed', () => { win = null; });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) start().catch(showErr);
});

function showErr(e) {
  try { dialog.showErrorBox('ZapFamily — Erro', String((e && e.stack) || e)); } catch (_) {}
  app.quit();
}

start().catch(showErr);
