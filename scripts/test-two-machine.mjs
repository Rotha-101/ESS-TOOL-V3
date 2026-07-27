/* END-TO-END: User A plots a graph -> it appears on User B's computer.
 *
 * The scenario this whole feature exists for. Two independent machines, each
 * with its own local storage, talking to one real folder on disk.
 *
 * Uses the REAL code throughout: electron/sync/repository.cjs (what the
 * Electron main process calls), the real syncService, the real essg-v1 codec,
 * and the real buildGraphRecord/restoreEvalData. Only two things are stood in
 * for — IndexedDB (a per-machine in-memory map) and the IPC hop.
 */
import { createRequire } from 'module';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FAKE_DB = path.join(HERE, 'fixtures', 'fake-db.mjs');
const require = createRequire(import.meta.url);
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));
const repo = require(path.join(ROOT, 'electron/sync/repository.cjs'));

const SHARE = path.join(os.tmpdir(), `ess-2machine-${process.pid}`);
const N = 86400;

let pass = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

// Built once; instantiated twice below so each machine gets genuinely separate
// local storage, exactly like two PCs.
const bundle = esbuild.buildSync({
  stdin: {
    contents: `
      export { runSync } from '@/lib/sync/syncService';
      export * from '@/lib/history-db';
      export { buildGraphRecord, restoreEvalData } from '@/features/daily-evaluation/services/graphRecord';
      export * as db from ${JSON.stringify(FAKE_DB.replace(/\\/g, '/'))};
    `,
    resolveDir: ROOT,
    loader: 'js',
  },
  bundle: true, format: 'esm', write: false, platform: 'neutral',
  mainFields: ['module', 'main'], absWorkingDir: ROOT,
  alias: { '@/lib/db': FAKE_DB, '@': path.join(ROOT, 'src') },
  define: { __APP_VERSION__: '"1.1.0"' },
}).outputFiles[0].text;

/** A distinct module instance per machine => independent local storage. */
const bootMachine = (label) =>
  import('data:text/javascript;base64,' +
    Buffer.from(`${bundle}\n//machine:${label}`).toString('base64'));

/** SyncTransport over the real repository module — what the IPC layer wraps. */
const folderTransport = (root) => ({
  kind: 'shared-folder',
  probe: () => repo.probe(root),
  listRecordIds: () => repo.listRecordIds(root),
  fetchMeta: (ref) => repo.fetchMeta(root, ref),
  fetchPayload: async (ref) => new Uint8Array(await repo.fetchPayload(root, ref)),
  putRecord: (meta, payload) => repo.putRecord(root, meta, payload),
});

// ---------------------------------------------------------------- test data
let seed = 4242;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const series = (kind) => {
  const a = new Array(N);
  for (let i = 0; i < N; i++) {
    const d = i / N;
    a[i] = kind === 'power' ? 40 * Math.sin(d * Math.PI * 2) + (rnd() - 0.5) * 0.4
      : kind === 'soc' ? 30 + 20 * Math.sin(d * Math.PI * 2 - 1)
      : kind === 'freq' ? 50 + (rnd() - 0.5) * 0.06
      : 22.8 + (rnd() - 0.5) * 0.3;
  }
  for (let i = 3600; i < 3900; i++) a[i] = NaN; // comms dropout
  return a;
};
const KIND = {
  pTotal: 'power', pPccPVS: 'power', pPV: 'power', pBESS: 'power', dispatchP: 'power',
  qTotal: 'power', qBess: 'power', cmdQ: 'power', cmdP: 'power', remoteP: 'power',
  soc: 'soc', freq: 'freq', vab: 'v', vbc: 'v', vca: 'v',
};

function makeEvalData(dataDate) {
  const [y, m, d] = dataDate.split('-').map(Number);
  const ev = { dataDate, processedFiles: ['POC_Plant01.xlsx', 'POC_Plant02.xlsx'], timestamps: [] };
  for (const f of Object.keys(KIND)) {
    ev[f] = { plant1: series(KIND[f]), plant2: series(KIND[f]), plant3: new Array(N).fill(NaN) };
  }
  for (let i = 0; i < N; i++) ev.timestamps.push(new Date(y, m - 1, d, 0, 0, i));
  ev.dailyCycle = { plant1: 1.234, plant2: 1.198, plant3: NaN };
  ev.totalCycle = { plant1: 412.5, plant2: 409.9, plant3: NaN };
  ev.hasCycleData = true;
  ev.avgDailyCycle = 1.216;
  ev.avgTotalCycle = 411.2;
  ev.socStats = {
    plant1: { maxSoc: 51.7, maxIdx: 43200, minSoc: 11.2, minIdx: 21600 },
    plant2: { maxSoc: 50.1, maxIdx: 43100, minSoc: 12.0, minIdx: 21500 },
    plant3: { maxSoc: 0, maxIdx: 0, minSoc: 0, minIdx: 0 },
  };
  ev.deviations = { highSOC: { pair: 'SWG01-SWG02', text: '1m 40s' }, lowSOC: { pair: 'SWG01-SWG02', text: '0m 55s' } };
  return ev;
}

const GRAPH_CONFIG = {
  showGrid: true, gridSize: 'small', showLegend: true, bgWhite: true, smooth: false,
  showMarkers: false, fillArea: false, lineWidths: [2, 1.6, 1.6, 1.8, 1.2],
  y1Min: '', y1Max: '', y2Min: '', y2Max: '', timeFrom: '00:00:00', timeTo: '23:59:59',
  dataResolution: 1, customTitle: 'SNTL600 Daily Check', customY1Label: 'P (MW)',
  customY2Label: 'SOC (%)', traceVisible: [true, true, false, true, true],
  lineDash: ['solid', 'dot', 'solid', 'dash', 'solid'], markerSize: 5, pinSize: 8, pinBgColor: '#ffffff',
};
const PINS = [{ id: 'p1', graphId: 'pf_plant1_soc', x: '08:15:00', y: 42.5, yref: 'y2', text: 'Peak', color: '#FF3B30', ax: 30, ay: -30 }];

// ---------------------------------------------------------------- run
(async () => {
  await fsp.rm(SHARE, { recursive: true, force: true }).catch(() => {});
  await fsp.mkdir(SHARE, { recursive: true });

  const A = await bootMachine('userA');
  const B = await bootMachine('userB');
  const tA = folderTransport(SHARE);
  const tB = folderTransport(SHARE);

  console.log('\n=== 1. Both machines start empty and independent ===');
  check('User A local history empty', (await A.listGraphHistory()).length === 0);
  check('User B local history empty', (await B.listGraphHistory()).length === 0);
  check('storage really is separate', A.db !== B.db);

  console.log('\n=== 2. User A plots the graph for the 27th ===');
  const ev27 = makeEvalData('2026-06-27');
  const recA = await A.buildGraphRecord({
    evalData: ev27, project: 'SNTL600', activeMetric: 'pf_p1', selectedPlant: 'plant1',
    showNccPCommand: true, graphConfig: GRAPH_CONFIG, pinnedPoints: PINS,
    engineerName: 'User A', machineName: 'ENG-WS-A',
  });
  await A.saveGraphRecord(recA, 'sig-27');
  const aList = await A.listGraphHistory();
  check("A's computer stores it locally", aList.length === 1 && aList[0].dataDate === '2026-06-27');
  check('payload is compact', recA.payload.byteLength < 3 * 1024 * 1024,
    `${(recA.payload.byteLength / 1024 / 1024).toFixed(2)} MB`);
  check('pending publish before sync', (await A.listPendingUploads()).length === 1);

  console.log('\n=== 3. A syncs -> graph lands on the shared folder ===');
  let r = await A.runSync(tA);
  check('published', r.uploaded === 1, `uploaded=${r.uploaded}`);
  check('no longer pending on A', (await A.listPendingUploads()).length === 0);
  const dir = path.join(SHARE, 'v1', 'SNTL600', '2026');
  const onShare = fs.readdirSync(dir);
  check('meta file on share', onShare.some((f) => f.startsWith('2026-06-27') && f.endsWith('__meta.json')));
  check('data file on share', onShare.some((f) => f.startsWith('2026-06-27') && f.endsWith('__data.essg.gz')));
  check('no .tmp debris', onShare.filter((f) => f.endsWith('.tmp')).length === 0);
  check('raw spreadsheets NOT on the share',
    !onShare.some((f) => /\.xlsx?$/i.test(f)) && onShare.length === 2, onShare.join(', '));

  console.log("\n=== 4. User B syncs -> the graph appears on B's computer ===");
  check("B's history empty before syncing", (await B.listGraphHistory()).length === 0);
  r = await B.runSync(tB);
  check('B downloaded it', r.downloaded === 1, `downloaded=${r.downloaded}`);
  const bList = await B.listGraphHistory();
  check("appears in B's list", bList.length === 1);
  check('same data date', bList[0].dataDate === '2026-06-27');
  check('attributed to User A', bList[0].engineerName === 'User A');
  check("stored on B's own computer too", (await B.loadGraphRecord(recA.meta.id)) !== null);

  console.log('\n=== 5. B opens it — identical to what A saw ===');
  const bRec = await B.loadGraphRecord(recA.meta.id);
  const bEval = B.restoreEvalData(bRec.meta, bRec.payload);
  check('title/labels preserved',
    bRec.meta.graphConfig.customTitle === 'SNTL600 Daily Check' && bRec.meta.graphConfig.customY2Label === 'SOC (%)');
  check('legend/grid/trace visibility preserved',
    JSON.stringify(bRec.meta.graphConfig.traceVisible) === JSON.stringify(GRAPH_CONFIG.traceVisible));
  check('pinned annotation preserved',
    bRec.meta.pinnedPoints.length === 1 && bRec.meta.pinnedPoints[0].text === 'Peak');
  check('figure + plant preserved',
    bRec.meta.view.activeMetric === 'pf_p1' && bRec.meta.view.selectedPlant === 'plant1');
  check('cycle numbers preserved', bEval.dailyCycle.plant1 === 1.234 && bEval.totalCycle.plant2 === 409.9);
  check('SOC markers preserved', bEval.socStats.plant1.maxSoc === 51.7);
  check('app version stamped', bRec.meta.provenance.appVersion === '1.1.0');
  check('timestamps rebuilt for the 27th',
    bEval.timestamps.length === N && bEval.timestamps[0].getDate() === 27 && bEval.timestamps[0].getHours() === 0);

  let maxErr = 0, nanBad = 0, compared = 0;
  for (const f of Object.keys(KIND)) {
    for (const p of ['plant1', 'plant2']) {
      const a = ev27[f][p], b = bEval[f][p];
      for (let i = 0; i < N; i++) {
        if (isNaN(a[i]) !== isNaN(b[i])) { nanBad++; continue; }
        if (isNaN(a[i])) continue;
        compared++;
        maxErr = Math.max(maxErr, Math.abs(a[i] - b[i]));
      }
    }
  }
  check('every plotted value matches within precision', maxErr <= 0.005 + 1e-9, maxErr.toExponential(2));
  check('data gaps land in the same places', nanBad === 0, String(nanBad));

  console.log('\n=== 6. Re-syncing does not duplicate ===');
  r = await B.runSync(tB);
  check('B downloads nothing new', r.downloaded === 0);
  check("B's list still has exactly one", (await B.listGraphHistory()).length === 1);

  console.log('\n=== 7. B plots the 28th -> it appears on A ===');
  const ev28 = makeEvalData('2026-06-28');
  const recB = await B.buildGraphRecord({
    evalData: ev28, project: 'SNTL600', activeMetric: 'fig5', selectedPlant: 'plant2',
    showNccPCommand: false, graphConfig: GRAPH_CONFIG, pinnedPoints: [],
    engineerName: 'User B', machineName: 'ENG-WS-B',
  });
  await B.saveGraphRecord(recB, 'sig-28');
  await B.runSync(tB);
  r = await A.runSync(tA);
  check("A received B's graph", r.downloaded === 1, `downloaded=${r.downloaded}`);
  const finalA = await A.listGraphHistory();
  const finalB = await B.listGraphHistory();
  check('A now has both days', finalA.length === 2);
  check('B now has both days', finalB.length === 2);
  check('both computers show the same history',
    JSON.stringify(finalA.map((e) => e.id).sort()) === JSON.stringify(finalB.map((e) => e.id).sort()));
  check('each graph keeps its own author',
    finalA.find((e) => e.dataDate === '2026-06-27').engineerName === 'User A' &&
    finalA.find((e) => e.dataDate === '2026-06-28').engineerName === 'User B');

  console.log(`\n  compared ${compared.toLocaleString()} plotted values · max error ${maxErr.toExponential(2)}`);

  await fsp.rm(SHARE, { recursive: true, force: true }).catch(() => {});

  console.log(`\ntwo-machine: ${pass} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log('   - ' + f));
  process.exit(failures.length ? 1 : 0);
})();
