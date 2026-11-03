'use strict';

// Bridge for the app's own setup/offline pages only. The tenant's /pos/ page loads in the same
// window, so expose nothing unless this frame is a local file: the till never sees this API.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('posDesktop', {
    getState: () => ipcRenderer.invoke('pos:get-state'),
    checkServer: (address) => ipcRenderer.invoke('pos:check-server', String(address ?? '')),
    saveServer: (address) => ipcRenderer.invoke('pos:save-server', String(address ?? '')),
    retry: () => ipcRenderer.invoke('pos:retry'),
    openSetup: () => ipcRenderer.invoke('pos:open-setup'),
  });
}
