const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { exportMatlabFigures } = require('./matlabExport.cjs');
const repository = require('./sync/repository.cjs');

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

app.whenReady().then(() => {
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
// All filesystem access to the SMB share happens here in the main process; the
// renderer only ever sees plain data. Every handler resolves rather than
// throws, because a shared folder being unreachable is an ordinary condition
// (laptop off the network) that the UI reports, not an exception.
// ---------------------------------------------------------------------------

const ok = (data) => ({ ok: true, ...data });
const fail = (err) => ({ ok: false, error: err && err.message ? err.message : String(err) });

/** Windows identity for attribution. AD authenticates the write itself; this is
 *  what the record displays. */
ipcMain.handle('sync:identity', async () => {
  try {
    return ok({ userName: os.userInfo().username, machineName: os.hostname() });
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('sync:probe', async (event, root) => {
  try {
    return ok(await repository.probe(root));
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('sync:list', async (event, root) => {
  try {
    return ok({ refs: await repository.listRecordIds(root) });
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('sync:fetch-meta', async (event, root, ref) => {
  try {
    return ok({ meta: await repository.fetchMeta(root, ref) });
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('sync:fetch-payload', async (event, root, ref) => {
  try {
    const buffer = await repository.fetchPayload(root, ref);
    // Buffer survives structured clone as a Uint8Array view in the renderer.
    return ok({ payload: new Uint8Array(buffer) });
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('sync:put', async (event, root, meta, payload) => {
  try {
    return ok(await repository.putRecord(root, meta, payload));
  } catch (err) {
    return fail(err);
  }
});

/** Folder picker for the Settings field, so nobody has to type a UNC path. */
ipcMain.handle('sync:choose-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select the shared graph repository folder',
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});
