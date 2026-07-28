/* Local history guard.
 *
 * The index is mutated from two independent places — auto-save when an
 * engineer generates a graph, and the sync loop when it imports records from
 * the service. Both do read-modify-write against one IndexedDB key, so
 * concurrency here is the difference between a graph appearing in the list and
 * silently vanishing from it. */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FAKE_DB = path.join(HERE, 'fixtures', 'fake-db.mjs');
const require = createRequire(import.meta.url);
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));

const out = esbuild.buildSync({
  stdin: {
    contents:
      `export * from '@/lib/history-db';\n` +
      `export * as db from ${JSON.stringify(FAKE_DB.replace(/\\/g, '/'))};\n`,
    resolveDir: ROOT,
    loader: 'js',
  },
  bundle: true, format: 'esm', write: false, platform: 'neutral',
  mainFields: ['module', 'main'], absWorkingDir: ROOT,
  alias: { '@/lib/db': FAKE_DB, '@': path.join(ROOT, 'src') },
});
const H = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

let pass = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

const rec = (id, project = 'SNTL600', dataDate = '2026-06-02', sha = id) => ({
  meta: {
    id, schemaVersion: 1, project, dataDate, revision: 1, isLatest: true,
    provenance: { engineerName: 'Eng ' + id, appVersion: '1.0.1', generatedAt: new Date(2026, 5, 2, 8, 0, 0).toISOString(), sourceFileNames: [] },
    view: { activeMetric: 'pf_p1', selectedPlant: 'plant1', showNccPCommand: false, availableMetrics: [] },
    graphConfig: {}, pinnedPoints: [],
    axis: { xStart: '00:00:00', xStepSeconds: 1, xCount: 86400 },
    summary: { dataDate, plantCount: 3, sampleCount: 86400, hasCycleData: true, hasNcc: false, dailyCycle: {}, totalCycle: {} },
    payload: { bytes: 10, sha256: sha, codec: 'essg-v1' },
  },
  payload: new Uint8Array([1, 2, 3]),
});

console.log('\n=== Concurrent index mutations must not lose entries ===');
H.db._reset();
await Promise.all([
  H.saveGraphRecord(rec('local-a'), 'sig-a'),
  H.importRemoteRecord(rec('remote-b', 'SNTL400', '2026-06-03')),
  H.importRemoteRecord(rec('remote-c', 'SNTB', '2026-06-04')),
]);
let list = await H.listGraphHistory();
check('all three concurrent writes survive', list.length === 3, `got ${list.length}`);

console.log('\n=== Concurrent markSynced must not lose the syncedAt stamps ===');
await Promise.all([H.markSynced('local-a'), H.markSynced('remote-b'), H.markSynced('remote-c')]);
list = await H.listGraphHistory();
check('every record marked synced', list.every((e) => Boolean(e.syncedAt)),
  list.filter((e) => !e.syncedAt).map((e) => e.id).join(','));
check('no pending uploads remain', (await H.listPendingUploads()).length === 0);

console.log('\n=== Save while a delete runs ===');
H.db._reset();
await H.saveGraphRecord(rec('keep-1'), 'sig-1');
await H.saveGraphRecord(rec('drop-1', 'SNTL400', '2026-06-05'), 'sig-2');
await Promise.all([H.deleteGraphRecord('drop-1'), H.saveGraphRecord(rec('keep-2', 'SNTB', '2026-06-06'), 'sig-3')]);
list = await H.listGraphHistory();
check('deleted record gone', !list.some((e) => e.id === 'drop-1'));
check('concurrent save survived the delete', list.some((e) => e.id === 'keep-2'), list.map(e => e.id).join(','));
check('untouched record survived', list.some((e) => e.id === 'keep-1'));

console.log('\n=== Revisions and duplicate detection ===');
H.db._reset();
const first = await H.saveGraphRecord(rec('r-1', 'SNTL600', '2026-06-02', 'sha-x'), 'sig');
const dup = await H.saveGraphRecord(rec('r-2', 'SNTL600', '2026-06-02', 'sha-x'), 'sig');
check('identical payload recognised as duplicate', dup.status === 'duplicate');
check('duplicate does not create a second entry', (await H.listGraphHistory()).length === 1);
const second = await H.saveGraphRecord(rec('r-3', 'SNTL600', '2026-06-02', 'sha-y'), 'sig2');
check('different payload same plant-day becomes revision 2', second.entry.revision === 2, String(second.entry.revision));
check('first record retained', (await H.listGraphHistory()).length === 2);

console.log('\n=== Signature short-circuit ===');
check('known signature detected', await H.hasSignature('SNTL600', '2026-06-02', 'sig'));
check('unknown signature not detected', !(await H.hasSignature('SNTL600', '2026-06-02', 'nope')));
check('signature is scoped to project+date',
  !(await H.hasSignature('SNTL400', '2026-06-02', 'sig')));

console.log('\n=== Imported records keep the originator identity ===');
H.db._reset();
await H.importRemoteRecord(rec('remote-x', 'SNTL600', '2026-06-09'));
const loaded = await H.loadGraphRecord('remote-x');
check('record round-trips from storage', loaded?.meta.id === 'remote-x');
check('imported record is already marked synced',
  (await H.listGraphHistory())[0].syncedAt !== undefined);
check('re-importing the same id is a no-op',
  (await H.importRemoteRecord(rec('remote-x', 'SNTL600', '2026-06-09')), (await H.listGraphHistory()).length) === 1);

console.log('\n=== Metadata-only records, and caching a payload on first open ===');
H.db._reset();
const remote = rec('meta-only', 'SNTL600', '2026-06-11', 'sha-mo');
await H.importRemoteMeta(remote.meta);
let entry = (await H.listGraphHistory())[0];
check('listed straight after sync', entry?.id === 'meta-only');
check('marked as not cached', entry.payloadCached === false);
check('marked synced (it came from the server)', Boolean(entry.syncedAt));
check('metadata is readable offline', (await H.loadGraphMeta('meta-only'))?.dataDate === '2026-06-11');
check('but the record is not loadable yet', (await H.loadGraphRecord('meta-only')) === null);
check('and has no payload', (await H.hasPayload('meta-only')) === false);
check('it is NOT queued for upload', (await H.listPendingUploads()).length === 0);
// Size reporting must reflect the disk, not the catalogue: a synced-but-unopened
// record costs ~1.9 KB of metadata, not the 0.84 MB its metadata declares.
let stats = await H.getHistoryStats();
check('counted as a record', stats.records === 1);
check('but contributes no stored bytes', stats.payloadBytes === 0, String(stats.payloadBytes));
check('and is not counted as cached', stats.cachedRecords === 0);

await H.putPayload('meta-only', remote.payload);
entry = (await H.listGraphHistory())[0];
check('cached after first open', entry.payloadCached === true);
check('now fully loadable', (await H.loadGraphRecord('meta-only'))?.payload?.length === 3);
stats = await H.getHistoryStats();
check('now counted as stored', stats.payloadBytes === 10 && stats.cachedRecords === 1);

check('re-importing the same id after caching is a no-op',
  (await H.importRemoteMeta(remote.meta), (await H.listGraphHistory()).length) === 1);
check('and does NOT discard the cached payload',
  (await H.loadGraphRecord('meta-only')) !== null);

console.log('\n=== Locally generated graphs are cached by definition ===');
H.db._reset();
const mine = await H.saveGraphRecord(rec('mine-1', 'SNTL600', '2026-06-12', 'sha-mine'), 'sig-mine');
check('own graph is cached immediately', mine.entry.payloadCached === true);
check('own graph IS queued for upload', (await H.listPendingUploads()).length === 1);

console.log(`\nhistory: ${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log('   - ' + f));
process.exit(failures.length ? 1 : 0);
