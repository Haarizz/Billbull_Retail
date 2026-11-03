'use strict';

const path = require('node:path');
const { app, BrowserWindow, Menu, dialog, ipcMain, net, session, shell } = require('electron');

const { normalizeServerUrl, isInsecureRemote, posUrl, looksLikePosPage, describeNetError } = require('./serverUrl');
const { classifyNavigation, classifyWindowOpen, isPermissionAllowed } = require('./navigationPolicy');
const { createSettingsStore } = require('./settingsStore');

// BillBull POS desktop shell. It loads the tenant's own https://<server>/pos/ page, so the till
// UI updates with every server deploy and keeps the same origin the print agent and backend
// already allow-list. The shell adds: first-run server setup, a locked-down window, an offline
// page, crash recovery and kiosk-style full screen.

const PAGES = path.join(__dirname, 'pages');
const LOCAL_PRELOAD = path.join(__dirname, 'preloadLocal.js');
const CHECK_TIMEOUT_MS = 8000;
const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

let settings;
let mainWindow = null;

app.enableSandbox();

// Testing/support: run with a separate settings folder (and so a separate single-instance lock).
if (process.env.BILLBULL_POS_USER_DATA) app.setPath('userData', path.resolve(process.env.BILLBULL_POS_USER_DATA));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(start);
}

function currentOrigin() {
  return settings.read().serverOrigin;
}

function secureWebPreferences(extra = {}) {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webviewTag: false,
    spellcheck: false,
    ...extra,
  };
}

function start() {
  app.setAppUserModelId('com.billbull.pos');
  settings = createSettingsStore(app.getPath('userData'));

  lockDownSession(session.defaultSession);
  registerIpc();
  Menu.setApplicationMenu(buildMenu());
  createMainWindow();

  app.on('window-all-closed', () => app.quit());
}

// ---------------------------------------------------------------------------------------------
// Security: permissions, navigation and popups
// ---------------------------------------------------------------------------------------------

function lockDownSession(ses) {
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(isPermissionAllowed(permission, details.requestingUrl || wc.getURL(), currentOrigin()));
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) =>
    isPermissionAllowed(permission, requestingOrigin, currentOrigin()));
}

function openExternal(url) {
  shell.openExternal(url).catch(() => {});
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());

  const guard = (event, url) => {
    const verdict = classifyNavigation(url, currentOrigin());
    if (verdict === 'allow') return;
    event.preventDefault();
    if (verdict === 'external') openExternal(url);
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);

  contents.setWindowOpenHandler(({ url }) => {
    const verdict = classifyWindowOpen(url, currentOrigin());
    if (verdict === 'allow') {
      // Print/report previews: a blank popup the till writes HTML into, then prints.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          width: 900,
          height: 800,
          webPreferences: secureWebPreferences(),
        },
      };
    }
    if (verdict === 'external') openExternal(url);
    return { action: 'deny' };
  });
});

// ---------------------------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------------------------

function createMainWindow() {
  const saved = settings.read();
  mainWindow = new BrowserWindow({
    title: 'BillBull POS',
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: secureWebPreferences({ preload: LOCAL_PRELOAD }),
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    if (saved.fullscreen) mainWindow.setFullScreen(true);
    mainWindow.show();
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  const wc = mainWindow.webContents;

  wc.on('did-finish-load', () => {
    if (isTillPage(wc.getURL())) wc.setZoomFactor(settings.read().zoomFactor || 1);
  });

  // A network failure on the till page: show the offline page instead of a blank window.
  wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* ERR_ABORTED */) return;
    if (!isTillPage(validatedURL)) return;
    showOffline(describeNetError(errorDescription || `error ${errorCode}`));
  });
  // The server answered, but with an error (e.g. 502 while it restarts).
  wc.on('did-navigate', (_e, url, httpResponseCode) => {
    if (httpResponseCode >= 500 && isTillPage(url)) showOffline(`The server returned HTTP ${httpResponseCode}`);
  });

  // The till may block closing/reloading while a sale is open (beforeunload). Electron would
  // otherwise silently ignore the close, so ask the cashier.
  wc.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Stay', 'Leave'],
      defaultId: 0,
      cancelId: 0,
      title: 'BillBull POS',
      message: 'The till has unsaved work.',
      detail: 'If you leave now, the current sale may be lost.',
    });
    if (choice === 1) event.preventDefault();
  });

  wc.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return;
    setTimeout(() => { if (mainWindow) openTill(); }, 1000);
  });

  mainWindow.on('unresponsive', async () => {
    if (!mainWindow) return;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Wait', 'Reload'],
      defaultId: 0,
      title: 'BillBull POS',
      message: 'The till is not responding.',
    });
    if (response === 1 && mainWindow) wc.reload();
  });

  if (saved.serverOrigin) openTill();
  else showSetup();
}

function isTillPage(url) {
  const origin = currentOrigin();
  if (!origin) return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function openTill() {
  const origin = currentOrigin();
  if (!origin || !mainWindow) return showSetup();
  mainWindow.loadURL(posUrl(origin));
}

function showSetup() {
  if (!mainWindow) return;
  mainWindow.loadFile(path.join(PAGES, 'setup.html'));
}

function showOffline(reason) {
  if (!mainWindow) return;
  mainWindow.loadFile(path.join(PAGES, 'offline.html'), { query: { reason: String(reason || '') } });
}

async function confirmLeaveTill() {
  if (!mainWindow || !isTillPage(mainWindow.webContents.getURL())) return true;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Cancel', 'Change server'],
    defaultId: 0,
    cancelId: 0,
    title: 'BillBull POS',
    message: 'Leave the till to change the server address?',
    detail: 'Finish or hold the current sale first.',
  });
  return response === 1;
}

// ---------------------------------------------------------------------------------------------
// Local pages (setup / offline) <-> main process
// ---------------------------------------------------------------------------------------------

function fromLocalPage(event) {
  const url = event.senderFrame?.url || '';
  return url.startsWith('file://') && event.sender === mainWindow?.webContents;
}

function registerIpc() {
  const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
    if (!fromLocalPage(event)) throw new Error('Not allowed');
    return fn(...args);
  });

  handle('pos:get-state', () => ({
    serverOrigin: currentOrigin(),
    version: app.getVersion(),
  }));

  handle('pos:check-server', (input) => checkServer(input));

  handle('pos:save-server', async (input) => {
    const result = await checkServer(input);
    if (!result.ok) return result;
    settings.write({ serverOrigin: result.origin });
    openTill();
    return result;
  });

  handle('pos:retry', () => openTill());
  handle('pos:open-setup', () => showSetup());
}

async function checkServer(input) {
  let origin;
  try {
    origin = normalizeServerUrl(input);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await net.fetch(posUrl(origin), { signal: controller.signal, cache: 'no-store' });
    // Follow an http -> https (or www) redirect: keep the address the server settled on.
    const finalOrigin = new URL(res.url || posUrl(origin)).origin;
    if (!res.ok) return { ok: false, origin, error: `The server answered with HTTP ${res.status}.` };
    const html = await res.text();
    if (!looksLikePosPage(html)) {
      return { ok: false, origin, error: 'The server answered, but the BillBull POS was not found at /pos/.' };
    }
    return {
      ok: true,
      origin: finalOrigin,
      warning: isInsecureRemote(finalOrigin)
        ? 'This address is not encrypted (http). Use https:// for a server on the internet.'
        : null,
    };
  } catch (err) {
    const message = err?.name === 'AbortError'
      ? 'The server did not answer in time.'
      : describeNetError(err?.message || err);
    return { ok: false, origin, error: message };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------------------------
// Menu (hidden; press Alt to show it). Shortcuts work while it is hidden.
// ---------------------------------------------------------------------------------------------

function setZoom(direction) {
  if (!mainWindow) return;
  const wc = mainWindow.webContents;
  let next = 1;
  if (direction !== 0) {
    const current = wc.getZoomFactor();
    const idx = ZOOM_STEPS.findIndex((z) => z >= current - 0.001);
    const base = idx === -1 ? ZOOM_STEPS.length - 1 : idx;
    next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, base + direction))];
  }
  wc.setZoomFactor(next);
  settings.write({ zoomFactor: next });
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Till',
      submenu: [
        { label: 'Reload', accelerator: 'F5', click: () => mainWindow?.webContents.reload() },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', visible: false, acceleratorWorksWhenHidden: true, click: () => mainWindow?.webContents.reload() },
        { label: 'Back to till', click: () => openTill() },
        { type: 'separator' },
        {
          label: 'Server address…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: async () => { if (await confirmLeaveTill()) showSetup(); },
        },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'Alt+F4', click: () => mainWindow?.close() },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Full screen',
          accelerator: 'F11',
          click: () => {
            if (!mainWindow) return;
            const next = !mainWindow.isFullScreen();
            mainWindow.setFullScreen(next);
            settings.write({ fullscreen: next });
          },
        },
        { type: 'separator' },
        { label: 'Zoom in', accelerator: 'CmdOrCtrl+=', click: () => setZoom(1) },
        { label: 'Zoom out', accelerator: 'CmdOrCtrl+-', click: () => setZoom(-1) },
        { label: 'Actual size', accelerator: 'CmdOrCtrl+0', click: () => setZoom(0) },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Developer tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow?.webContents.toggleDevTools() },
        {
          label: 'About BillBull POS',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'BillBull POS',
            message: `BillBull POS ${app.getVersion()}`,
            detail: `Server: ${currentOrigin() || 'not set'}\nElectron ${process.versions.electron}`,
          }),
        },
      ],
    },
  ]);
}
