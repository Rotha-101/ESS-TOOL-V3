const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveChartScript: (projectId, scriptContent) => ipcRenderer.invoke('save-chart-script', projectId, scriptContent),
  loadChartScript: (projectId) => ipcRenderer.invoke('load-chart-script', projectId),
  selectZipFile: (defaultName) => ipcRenderer.invoke('select-zip-file', defaultName),
  saveMatlabFigures: (data) => ipcRenderer.invoke('save-matlab-figures', data)
});

// Shared graph repository. The renderer never talks to the network directly; it
// passes the configured server URL with each call, so the main process holds no
// sync state of its own.
//
// Note there is no getKey: the access key can be set, cleared and tested for,
// but never read back into the renderer.
contextBridge.exposeInMainWorld('syncAPI', {
  identity: () => ipcRenderer.invoke('sync:identity'),
  probe: (baseUrl) => ipcRenderer.invoke('sync:probe', baseUrl),
  list: (baseUrl) => ipcRenderer.invoke('sync:list', baseUrl),
  fetchMeta: (baseUrl, ref) => ipcRenderer.invoke('sync:fetch-meta', baseUrl, ref),
  fetchPayload: (baseUrl, ref) => ipcRenderer.invoke('sync:fetch-payload', baseUrl, ref),
  put: (baseUrl, meta, payload) => ipcRenderer.invoke('sync:put', baseUrl, meta, payload),
  hasKey: () => ipcRenderer.invoke('sync:has-key'),
  setKey: (key) => ipcRenderer.invoke('sync:set-key', key),
  clearKey: () => ipcRenderer.invoke('sync:clear-key')
});
