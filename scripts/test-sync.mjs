/* Synchronisation guard: drives the real runSync with a fake SyncTransport to
 * prove the offline / retry / read-only / partial-failure behaviour. */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FAKE_DB = path.join(HERE, 'fixtures', 'fake-history-db.mjs');
const require = createRequire(import.meta.url);
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));

// Bundle syncService AND the fake history-db from ONE entry via stdin, so the
// test and the service share a single module instance. Importing the fake
// separately gives two instances with separate state, and every assertion
// about what was stored then silently inspects the wrong copy.
const out = esbuild.buildSync({
  stdin: {
    contents:
      `export { runSync, ensurePayload } from '@/lib/sync/syncService';\n` +
      `export * as fake from ${JSON.stringify(FAKE_DB.replace(/\\/g, '/'))};\n`,
    resolveDir: ROOT,
    loader: 'js',
  },
  bundle: true, format: 'esm', write: false, platform: 'neutral',
  mainFields: ['module', 'main'], absWorkingDir: ROOT,
  alias: {
    '@/lib/history-db': FAKE_DB,
    '@': path.join(ROOT, 'src'),
  },
});
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const { runSync, ensurePayload, fake } = mod;

const enc = new TextEncoder();
const sha256 = async (bytes) => {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
};

let pass = 0; const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

async function makeRecord(id, project = 'SNTL600', dataDate = '2026-06-02') {
  const payload = enc.encode(`payload-${id}`.repeat(20));
  return {
    meta: {
      id, schemaVersion: 1, project, dataDate, revision: 1, isLatest: true,
      provenance: { engineerName: 'Engineer ' + id, appVersion: '1.0.1', generatedAt: new Date().toISOString(), sourceFileNames: [] },
      view: { activeMetric: 'pf_p1', selectedPlant: 'plant1', showNccPCommand: false, availableMetrics: [] },
      graphConfig: {}, pinnedPoints: [],
      axis: { xStart: '00:00:00', xStepSeconds: 1, xCount: 86400 },
      summary: { dataDate, plantCount: 3, sampleCount: 86400, hasCycleData: true, hasNcc: false, dailyCycle: {}, totalCycle: {} },
      payload: { bytes: payload.byteLength, sha256: await sha256(payload), codec: 'essg-v1' },
    },
    payload,
  };
}

/** Fake share. `remote` is what lives in the folder.
 *
 * Keyed by FILE id, not by meta.id: on a real share the ref id comes from the
 * filename and the metadata inside can claim something different. A fake that
 * keys by meta.id makes that mismatch unrepresentable and silently drops the
 * check. Set `_fileId` on a record to make the two disagree. */
function makeTransport({ reachable = true, writable = true, remote = [], corruptIds = [], throwOnList = false } = {}) {
  const store = new Map(remote.map(r => [r._fileId ?? r.meta.id, r]));
  const puts = [];
  // Every payload fetch is recorded, so a test can prove sync did NOT pull the
  // ~0.84 MB series blocks — the property the lazy design exists for.
  const payloadFetches = [];
  return {
    kind: 'fake', puts, store, payloadFetches,
    async probe() { return { reachable, writable, error: reachable ? null : 'Server unavailable.' }; },
    async listRecordIds() {
      if (throwOnList) throw new Error('listing failed');
      return [...store.entries()].map(([fileId, r]) => ({ id: fileId, project: r.meta.project, dataDate: r.meta.dataDate, year: '2026' }));
    },
    async fetchMeta(ref) { return store.get(ref.id).meta; },
    async fetchPayload(ref) {
      payloadFetches.push(ref.id);
      const rec = store.get(ref.id);
      // Simulate a truncated download.
      return corruptIds.includes(ref.id) ? rec.payload.slice(0, 5) : rec.payload;
    },
    async putRecord(meta, payload) { puts.push(meta.id); store.set(meta.id, { meta, payload }); return { status: 'written', id: meta.id }; },
  };
}

// ---------------------------------------------------------------------------
console.log('\n=== 1. Server unavailable (offline) ===');
fake.reset();
const localOnly = await makeRecord('local-1');
fake.seedLocal(localOnly.meta, localOnly.payload, undefined); // pending upload
let r = await runSync(makeTransport({ reachable: false }));
check('does not throw', true);
check('reports unreachable', r.status.reachable === false);
check('nothing downloaded', r.downloaded === 0);
check('nothing uploaded', r.uploaded === 0);
check('local record still pending', (await fake.listPendingUploads()).length === 1);
check('no failures recorded for being offline', r.failures.length === 0, JSON.stringify(r.failures));

console.log('\n=== 2. Comes back online → pending record publishes automatically ===');
const t2 = makeTransport({ reachable: true, writable: true });
r = await runSync(t2);
check('uploaded the pending record', r.uploaded === 1, `uploaded=${r.uploaded}`);
check('transport received it', t2.puts.includes('local-1'));
check('marked as synced', (await fake.listPendingUploads()).length === 0);
r = await runSync(t2);
check('second pass does not re-upload', r.uploaded === 0);

console.log('\n=== 3. Receives new records — METADATA ONLY ===');
fake.reset();
const remote = [await makeRecord('r1'), await makeRecord('r2', 'SNTL400', '2026-06-03')];
const t3 = makeTransport({ remote });
r = await runSync(t3);
check('received both', r.downloaded === 2, `downloaded=${r.downloaded}`);
check('now known locally', (await fake.listKnownIds()).size === 2);
// The point of the whole lazy design: a sync pass must not move series blocks.
check('NO payloads fetched during sync', t3.payloadFetches.length === 0, JSON.stringify(t3.payloadFetches));
check('records are listed but not yet openable', (await fake.loadGraphRecord('r1')) === null);
check('metadata IS available offline', (await fake.loadGraphMeta('r1'))?.id === 'r1');
r = await runSync(t3);
check('re-sync downloads nothing (id-set cursor)', r.downloaded === 0);
check('re-sync still fetched no payloads', t3.payloadFetches.length === 0);

console.log('\n=== 3b. Opening a graph fetches its payload, once ===');
const meta1 = await fake.loadGraphMeta('r1');
const got = await ensurePayload(t3, meta1);
check('payload returned', got.byteLength === remote[0].payload.byteLength);
check('exactly one payload fetched', t3.payloadFetches.length === 1, JSON.stringify(t3.payloadFetches));
check('only the opened record was fetched', t3.payloadFetches[0] === 'r1');
check('now cached locally', (await fake.hasPayload('r1')) === true);
check('record is now fully openable', (await fake.loadGraphRecord('r1'))?.payload?.byteLength > 0);
check('the OTHER record is still payload-free', (await fake.hasPayload('r2')) === false);

console.log('\n=== 4. Read-only share (Management) never attempts uploads ===');
fake.reset();
const pending = await makeRecord('mgmt-local');
fake.seedLocal(pending.meta, pending.payload, undefined);
const t4 = makeTransport({ writable: false, remote: [await makeRecord('r3')] });
r = await runSync(t4);
check('still downloads', r.downloaded === 1);
check('no upload attempted', r.uploaded === 0 && t4.puts.length === 0);
check('record stays pending locally', (await fake.listPendingUploads()).length === 1);
check('no spurious failures', r.failures.length === 0, JSON.stringify(r.failures));

console.log('\n=== 5. Corrupt/truncated payload is rejected AT OPEN time ===');
// Checksum verification moved with the payload fetch: sync no longer downloads
// series blocks, so a truncated transfer can only be detected when one is
// actually pulled. What must not change is that a corrupt payload never becomes
// a local record presented as genuine.
fake.reset();
const good1 = await makeRecord('good-1'), bad = await makeRecord('bad-1'), good2 = await makeRecord('good-2');
const t5 = makeTransport({ remote: [good1, bad, good2], corruptIds: ['bad-1'] });
r = await runSync(t5);
check('all three received as metadata', r.downloaded === 3, `downloaded=${r.downloaded}`);
check('sync itself reports no failures', r.failures.length === 0, JSON.stringify(r.failures));

let openError = '';
try {
  await ensurePayload(t5, await fake.loadGraphMeta('bad-1'));
} catch (err) { openError = err.message; }
check('opening the corrupt record throws', Boolean(openError));
check('failure mentions checksum', /checksum/i.test(openError), openError);
check('corrupt payload NOT cached', (await fake.hasPayload('bad-1')) === false);
check('corrupt record stays unopenable', (await fake.loadGraphRecord('bad-1')) === null);

// A bad neighbour must not poison the good ones.
await ensurePayload(t5, await fake.loadGraphMeta('good-1'));
await ensurePayload(t5, await fake.loadGraphMeta('good-2'));
check('good records still open fine', (await fake.hasPayload('good-1')) && (await fake.hasPayload('good-2')));

console.log('\n=== 5b. Malformed metadata is rejected before it is trusted ===');
fake.reset();
const okRec = await makeRecord('ok-1');
// A file that parses as JSON but is not a graph record. Without a structural
// check it would skip checksum verification simply by not declaring one.
const junk = { _fileId: 'junk-1', meta: { id: 'junk-1', project: 'SNTL600', dataDate: '2026-06-02' }, payload: enc.encode('x') };
// Metadata claiming an id different from its filename: if stored under the
// claimed id, the cursor would never match and it would re-download forever.
const mismatched = await makeRecord('claims-other');
mismatched._fileId = 'claims-other';
mismatched.meta.id = 'a-different-id';
const t5b = makeTransport({ remote: [okRec, junk, mismatched] });
// listRecordIds derives refs from the store keys, so `mismatched` is offered as
// 'claims-other' while its contents say otherwise — exactly the on-disk case.
r = await runSync(t5b);
check('valid record still downloaded', r.downloaded === 1, `downloaded=${r.downloaded}`);
check('both malformed records rejected', r.failures.length === 2, JSON.stringify(r.failures));
check('missing-checksum record not stored', !(await fake.listKnownIds()).has('junk-1'));
check('id-mismatch record not stored', !(await fake.listKnownIds()).has('a-different-id'));
check('rejection reasons are specific',
  r.failures.some(f => /not a valid graph record/i.test(f)) && r.failures.some(f => /id mismatch/i.test(f)),
  JSON.stringify(r.failures));

console.log('\n=== 6. Transport error while listing does not crash the pass ===');
fake.reset();
const stuck = await makeRecord('p1');
fake.seedLocal(stuck.meta, stuck.payload, undefined);
const t6 = makeTransport({ throwOnList: true });
r = await runSync(t6);
check('pass completes', Boolean(r.finishedAt));
check('listing error recorded', r.failures.some(f => /listing failed/.test(f)), JSON.stringify(r.failures));
check('upload still attempted despite pull failure', r.uploaded === 1, `uploaded=${r.uploaded}`);

console.log('\n=== 7. maxDownloads caps a pass; the next pass continues ===');
fake.reset();
const many = [];
for (let i = 0; i < 12; i++) many.push(await makeRecord('m' + i));
const t7 = makeTransport({ remote: many });
r = await runSync(t7, { maxDownloads: 5 });
check('first pass capped at 5', r.downloaded === 5, `downloaded=${r.downloaded}`);
r = await runSync(t7, { maxDownloads: 5 });
check('second pass takes the next 5', r.downloaded === 5, `downloaded=${r.downloaded}`);
r = await runSync(t7, { maxDownloads: 5 });
check('third pass finishes the remainder', r.downloaded === 2, `downloaded=${r.downloaded}`);
check('all 12 present', (await fake.listKnownIds()).size === 12);

console.log('\n=== 8. Two engineers, same plant-day, both survive ===');
fake.reset();
const a = await makeRecord('eng-a', 'SNTL600', '2026-06-10');
const b = await makeRecord('eng-b', 'SNTL600', '2026-06-10');
const t8 = makeTransport({ remote: [a, b] });
r = await runSync(t8);
check('both downloaded', r.downloaded === 2);
check('both retained locally', (await fake.listKnownIds()).size === 2);

console.log('\n============================================');
console.log(`checks passed : ${pass}`);
console.log(`failures      : ${failures.length}`);
failures.forEach(f => console.log('   - ' + f));
console.log(`RESULT: ${failures.length === 0 ? 'PASS' : 'FAIL'}`);
console.log('============================================');
process.exit(failures.length ? 1 : 0);
