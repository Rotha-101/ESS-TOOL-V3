const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { exportMatlabFigures } = require('./matlabExport.cjs');
const api = require('./sync/apiClient.cjs');
const credentials = require('./sync/credentials.cjs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  
  if (isDev) {
    // In dev, assuming Vite runs on 3000 by default (as per our package.json script)
    // Wait a bit for Vite to start before loading
    setTimeout(() => {
      win.loadURL('http://localhost:3000').catch(() => {
        // Fallback or retry
        setTimeout(() => win.loadURL('http://localhost:3000'), 2000);
      });
    }, 1000);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');

// Storage isolation.
//
// Electron derives userData from package.json `name`, which is the same string
// for a dev run (`electron .`) and for the installed build — so both used
// %APPDATA%\ess-toolbox and fought over the same IndexedDB LOCK files. The
// result was "Could not open the quota database", after which locally stored
// graph payloads became unreadable.
//
// Only the DEV path moves. The installed app keeps the directory it already
// uses, so no engineer loses local history to this fix.
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'ess-toolbox-dev'));
}

// One instance per install, for the same reason: two copies of the same app
// share one userData directory and corrupt storage exactly as above. Double
// clicking the shortcut twice is an easy thing for anyone to do, so the second
// launch focuses the existing window instead of starting a rival process.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (!existing) return;
    if (existing.isMinimized()) existing.restore();
    existing.focus();
  });
}

app.whenReady().then(() => {
  if (!hasInstanceLock) return;
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


// IPC Handler: save-chart-script
ipcMain.handle('save-chart-script', async (event, projectId, scriptContent) => {
  try {
    const pluginsDir = path.join(app.getPath('userData'), 'plugins');
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
    const filePath = path.join(pluginsDir, projectId + '_chart.js');
    fs.writeFileSync(filePath, scriptContent);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// IPC Handler: load-chart-script
ipcMain.handle('load-chart-script', async (event, projectId) => {
  try {
    const pluginsDir = path.join(app.getPath('userData'), 'plugins');
    const filePath = path.join(pluginsDir, projectId + '_chart.js');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { ok: true, content };
    }
    return { ok: true, content: null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// IPC Handler: select-zip-file
ipcMain.handle('select-zip-file', async (event, defaultName) => {
  const result = await dialog.showSaveDialog({
    title: 'Save MATLAB Export ZIP',
    filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
    defaultPath: defaultName || 'MATLAB_Export.zip'
  });
  return result.canceled ? null : result.filePath;
});

// IPC Handler: save-matlab-figures
ipcMain.handle('save-matlab-figures', async (event, payload) => {
  return exportMatlabFigures(payload);
});


// ---------------------------------------------------------------------------
// Shared graph repository (see docs/GRAPH_REPOSITORY.md)
//
// All network access to the service happens here in the main process, for the
// same reason filesystem access used to: this is where the access key lives,
// and it must never reach the renderer. The renderer sees plain data only.
//
// Every handler resolves rather than throws, because an unreachable service is
// an ordinary condition (no internet) the UI reports, not an exception.
// ---------------------------------------------------------------------------

const ok = (data) => ({ ok: true, ...data });
const fail = (err) => ({ ok: false, error: err && err.message ? err.message : String(err) });

/** Machine name for record provenance. The engineer's NAME is not taken from
 *  here — the server overwrites it from the access key, so attribution cannot
 *  be spoofed by editing local settings. */
ipcMain.handle('sync:identity', async () => {
  try {
    return ok({ userName: os.userInfo().username, machineName: os.hostname() });
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('sync:probe', async (event, baseUrl) => {
  try {
    return ok(await api.probe(baseUrl));
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('sync:list', async (event, baseUrl) => {
  try {
    return ok({ refs: await api.listRecordIds(baseUrl) });
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('sync:fetch-meta', async (event, baseUrl, ref) => {
  try {
    return ok({ meta: await api.fetchMeta(baseUrl, ref) });
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('sync:fetch-payload', async (event, baseUrl, ref) => {
  try {
    // Uint8Array survives structured clone into the renderer.
    return ok({ payload: await api.fetchPayload(baseUrl, ref) });
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('sync:put', async (event, baseUrl, meta, payload) => {
  try {
    return ok(await api.putRecord(baseUrl, meta, payload));
  } catch (err) {
    return fail(err);
  }
});

// --- Access key. The renderer may set, clear and ask whether one exists, but
// --- there is deliberately no handler that returns the key itself.
ipcMain.handle('sync:has-key', async () => {
  try {
    return ok({ hasKey: credentials.hasKey() });
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('sync:set-key', async (event, key) => {
  try {
    return ok(credentials.setKey(key));
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('sync:clear-key', async () => {
  try {
    return ok(credentials.clearKey());
  } catch (err) {
    return fail(err);
  }
});
