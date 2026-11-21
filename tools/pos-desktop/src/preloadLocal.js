'use strict';

// Bridges for the main window.
//  - posDesktop: the app's own setup/offline pages only (local files). The till never sees it.
//  - billbullDesktop: the till (/pos/ on the server) gets exactly one call, printPreview(html),
//    because Electron has no print preview of its own. The main process accepts it only from the
//    main window's top frame on the configured server, and it can only open a preview window.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'https:' || location.protocol === 'http:') {
  contextBridge.exposeInMainWorld('billbullDesktop', {
    printPreview: (html) => ipcRenderer.invoke('pos:print-preview', String(html ?? '')),
  });
}

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('posDesktop', {
    getState: () => ipcRenderer.invoke('pos:get-state'),
    checkServer: (address) => ipcRenderer.invoke('pos:check-server', String(address ?? '')),
    saveServer: (address) => ipcRenderer.invoke('pos:save-server', String(address ?? '')),
    retry: () => ipcRenderer.invoke('pos:retry'),
    openSetup: () => ipcRenderer.invoke('pos:open-setup'),
  });
}
