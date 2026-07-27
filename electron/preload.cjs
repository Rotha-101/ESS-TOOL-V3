const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveChartScript: (projectId, scriptContent) => ipcRenderer.invoke('save-chart-script', projectId, scriptContent),
  loadChartScript: (projectId) => ipcRenderer.invoke('load-chart-script', projectId),
  selectZipFile: (defaultName) => ipcRenderer.invoke('select-zip-file', defaultName),
  saveMatlabFigures: (data) => ipcRenderer.invoke('save-matlab-figures', data)
});

// Shared graph repository. The renderer never touches the filesystem directly;
// it passes the configured root path with each call so the main process holds
// no sync state of its own.
contextBridge.exposeInMainWorld('syncAPI', {
  identity: () => ipcRenderer.invoke('sync:identity'),
  probe: (root) => ipcRenderer.invoke('sync:probe', root),
  list: (root) => ipcRenderer.invoke('sync:list', root),
  fetchMeta: (root, ref) => ipcRenderer.invoke('sync:fetch-meta', root, ref),
  fetchPayload: (root, ref) => ipcRenderer.invoke('sync:fetch-payload', root, ref),
  put: (root, meta, payload) => ipcRenderer.invoke('sync:put', root, meta, payload),
  chooseFolder: () => ipcRenderer.invoke('sync:choose-folder')
});
