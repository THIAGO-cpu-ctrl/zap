// ZapFamily — ponte segura renderer -> main (ícone e título personalizáveis)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('zfAPI', {
  setIcon: (dataURL) => ipcRenderer.invoke('zf-set-icon', dataURL),
  resetIcon: () => ipcRenderer.invoke('zf-reset-icon'),
  setTitle: (title) => ipcRenderer.invoke('zf-set-title', title),
});
