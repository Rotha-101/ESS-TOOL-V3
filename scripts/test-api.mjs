/* Worker API guard.
 *
 * Drives the real Worker fetch handler against real SQL (node:sqlite running
 * the actual migration) and an in-memory R2. No Cloudflare account, no network,
 * no wrangler — but the routing, auth, roles, validation and SQL are all the
 * code that will be deployed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createFakeD1 } from './fixtures/fake-d1.mjs';
import { createFakeR2 } from './fixtures/fake-r2.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SERVER = path.join(ROOT, 'server');
const require = createRequire(import.meta.url);
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));

const worker = (
  await import(
    'data:text/javascript;base64,' +
      Buffer.from(
        esbuild.buildSync({
          entryPoints: [path.join(SERVER, 'src/index.ts')],
          bundle: true, format: 'esm', write: false, platform: 'neutral',
          absWorkingDir: SERVER,
        }).outputFiles[0].text,
      ).toString('base64')
  )
).default;

const schema = fs.readFileSync(path.join(SERVER, 'migrations/0001_init.sql'), 'utf8');
const env = { DB: createFakeD1(schema), BUCKET: createFakeR2() };

let pass = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

const BASE = 'https://api.example.com';
const call = (method, p, { key, body, headers = {} } = {}) =>
  worker.fetch(
    new Request(`${BASE}${p}`, {
      method,
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers },
      body,
    }),
    env,
  );

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** Seed a key straight into the database, as an admin does at deploy time. */
async function seedKey(userName, role, email = null) {
  const key = crypto.randomBytes(32).toString('hex');
  await env.DB.prepare(
    `INSERT INTO access_keys (id, key_hash, user_name, user_email, role, created_at)
     VALUES (?,?,?,?,?,?)`,
  ).bind(crypto.randomUUID(), sha256(key), userName, email, role, new Date().toISOString()).run();
  return key;
}

function makeMeta(id, project = 'SNTL600', dataDate = '2026-06-27', payload, claimedName = 'Someone Else') {
  return {
    id, schemaVersion: 1, project, dataDate, revision: 1, isLatest: true,
    provenance: {
      engineerName: claimedName, machineName: 'ENG-WS-A', appVersion: '1.2.0',
      generatedAt: '2026-06-27T08:00:00+07:00', sourceFileNames: ['POC.xlsx'],
    },
    view: { activeMetric: 'pf_p1', selectedPlant: 'plant1', showNccPCommand: true, availableMetrics: ['pf_p1'] },
    graphConfig: { customTitle: 'SNTL600 Daily Check' },
    pinnedPoints: [],
    axis: { xStart: '00:00:00', xStepSeconds: 1, xCount: 86400 },
    summary: { dataDate, plantCount: 3, sampleCount: 86400, hasCycleData: true, hasNcc: true, dailyCycle: {}, totalCycle: {} },
    payload: { bytes: payload.byteLength, sha256: sha256(payload), codec: 'essg-v1' },
  };
}

const publishForm = (meta, payload) => {
  const form = new FormData();
  form.set('meta', JSON.stringify(meta));
  form.set('payload', new Blob([payload]), 'g.essg.gz');
  return form;
};

// ---------------------------------------------------------------------------
console.log('\n=== 1. Health is public; everything else needs a key ===');
let res = await call('GET', '/v1/health');
check('health reachable without a key', res.status === 200);
check('health reports the schema version', (await res.json()).schemaVersion === 1);

res = await call('GET', '/v1/graphs/ids');
check('no key -> 401', res.status === 401);
check('401 carries WWW-Authenticate', res.headers.get('www-authenticate') === 'Bearer');
res = await call('GET', '/v1/graphs/ids', { key: 'not-a-real-key' });
check('bad key -> 401', res.status === 401);
check('error is problem+json', (res.headers.get('content-type') || '').includes('application/problem+json'));

console.log('\n=== 2. Identity and role come from the key ===');
const engineerKey = await seedKey('CHEA Rotha', 'engineer', 'rotha@example.com');
const viewerKey = await seedKey('Top Manager', 'viewer');
const adminKey = await seedKey('IT Admin', 'admin');

res = await call('GET', '/v1/me', { key: engineerKey });
let me = await res.json();
check('engineer identified', me.userName === 'CHEA Rotha' && me.role === 'engineer');
check('engineer is writable', me.writable === true);

me = await (await call('GET', '/v1/me', { key: viewerKey })).json();
check('viewer identified', me.role === 'viewer');
check('viewer is NOT writable (drives read-only UI)', me.writable === false);

console.log('\n=== 3. Publishing ===');
const payload = crypto.randomBytes(4096);
const meta = makeMeta('gA1', 'SNTL600', '2026-06-27', payload);

res = await call('POST', '/v1/graphs', { key: viewerKey, body: publishForm(meta, payload) });
check('viewer cannot publish -> 403', res.status === 403);
check('viewer refusal explains why', /read-only/i.test((await res.json()).detail));

res = await call('POST', '/v1/graphs', { key: engineerKey, body: publishForm(meta, payload) });
check('engineer publishes -> 201', res.status === 201, String(res.status));
check('reports written', (await res.json()).status === 'written');

res = await call('POST', '/v1/graphs', { key: engineerKey, body: publishForm(meta, payload) });
const dup = await res.json();
check('re-publish is idempotent', res.status === 200 && dup.status === 'exists');
check('no duplicate object in storage', env.BUCKET._size() === 1, String(env.BUCKET._size()));

console.log('\n=== 4. Attribution cannot be spoofed ===');
res = await call('GET', '/v1/graphs/gA1', { key: viewerKey });
const stored = await res.json();
check('server overwrote the claimed author', stored.provenance.engineerName === 'CHEA Rotha',
  stored.provenance.engineerName);
check('server filled in the email from the key', stored.provenance.engineerEmail === 'rotha@example.com');
check('server stamped uploadedAt', typeof stored.provenance.uploadedAt === 'string');
check('everything else preserved verbatim',
  stored.graphConfig.customTitle === 'SNTL600 Daily Check' && stored.view.showNccPCommand === true);

console.log('\n=== 5. Listing and payload retrieval ===');
res = await call('GET', '/v1/graphs/ids', { key: viewerKey });
const { records } = await res.json();
check('id listed', records.length === 1 && records[0].id === 'gA1');
check('list carries project and date', records[0].project === 'SNTL600' && records[0].dataDate === '2026-06-27');

res = await call('GET', '/v1/graphs/gA1/payload', { key: viewerKey });
const got = new Uint8Array(await res.arrayBuffer());
check('payload byte-identical', Buffer.compare(Buffer.from(got), payload) === 0);
check('served as octet-stream', res.headers.get('content-type') === 'application/octet-stream');
// If this were set, fetch would transparently decompress and the essg-v1
// decoder would be handed bytes it cannot gunzip.
check('Content-Encoding NOT set (client gunzips itself)', res.headers.get('content-encoding') === null);

console.log('\n=== 6. Bad uploads are rejected at write time ===');
const other = crypto.randomBytes(2048);
let bad = makeMeta('gBad1', 'SNTL600', '2026-06-28', other);
bad.payload.sha256 = sha256(crypto.randomBytes(16)); // wrong checksum
res = await call('POST', '/v1/graphs', { key: engineerKey, body: publishForm(bad, other) });
check('checksum mismatch -> 400', res.status === 400);
check('reason mentions checksum', /checksum/i.test((await res.json()).detail));

bad = makeMeta('gBad2', 'SNTL600', '2026-06-28', other);
delete bad.payload.sha256;
res = await call('POST', '/v1/graphs', { key: engineerKey, body: publishForm(bad, other) });
check('missing checksum -> 400', res.status === 400);

bad = makeMeta('gBad3', '../../etc', '2026-06-28', other);
res = await call('POST', '/v1/graphs', { key: engineerKey, body: publishForm(bad, other) });
check('path traversal in project -> 400', res.status === 400);

bad = makeMeta('gBad4', 'SNTL600', '2026-06-28', other);
delete bad.provenance.generatedAt;
res = await call('POST', '/v1/graphs', { key: engineerKey, body: publishForm(bad, other) });
check('missing generatedAt -> 400', res.status === 400);

res = await call('POST', '/v1/graphs', { key: engineerKey, body: 'not-multipart', headers: { 'content-type': 'text/plain' } });
check('non-multipart body -> 400', res.status === 400);

check('nothing bad reached storage', env.BUCKET._size() === 1, String(env.BUCKET._size()));

console.log('\n=== 7. Admin key management ===');
res = await call('POST', '/v1/admin/keys', {
  key: engineerKey, body: JSON.stringify({ userName: 'X', role: 'admin' }),
  headers: { 'content-type': 'application/json' },
});
check('engineer cannot issue keys -> 403', res.status === 403);

res = await call('POST', '/v1/admin/keys', {
  key: adminKey, body: JSON.stringify({ userName: 'New Engineer', role: 'engineer' }),
  headers: { 'content-type': 'application/json' },
});
const issued = await res.json();
check('admin issues a key -> 201', res.status === 201);
check('plaintext key returned once', typeof issued.key === 'string' && issued.key.length === 64);
check('new key works immediately',
  (await (await call('GET', '/v1/me', { key: issued.key })).json()).userName === 'New Engineer');

res = await call('POST', '/v1/admin/keys', {
  key: adminKey, body: JSON.stringify({ userName: 'Bad', role: 'superuser' }),
  headers: { 'content-type': 'application/json' },
});
check('invalid role rejected -> 400', res.status === 400);

res = await call('GET', '/v1/admin/keys', { key: adminKey });
const listed = await res.json();
check('admin can list keys', listed.keys.length === 4, String(listed.keys.length));
check('hashes never returned', !JSON.stringify(listed).includes('key_hash') && !JSON.stringify(listed).includes('keyHash'));

res = await call('DELETE', `/v1/admin/keys/${issued.id}`, { key: adminKey });
check('revocation succeeds', res.status === 200);
check('revoked key rejected immediately', (await call('GET', '/v1/me', { key: issued.key })).status === 401);

const selfId = listed.keys.find((k) => k.userName === 'IT Admin').id;
res = await call('DELETE', `/v1/admin/keys/${selfId}`, { key: adminKey });
check('cannot revoke your own key -> 400', res.status === 400);

console.log('\n=== 8. Routing ===');
check('unknown path -> 404', (await call('GET', '/v1/nope', { key: adminKey })).status === 404);
check('wrong method -> 404', (await call('DELETE', '/v1/graphs/gA1', { key: adminKey })).status === 404);
check('unknown graph -> 404', (await call('GET', '/v1/graphs/missing', { key: adminKey })).status === 404);
check('trailing slash tolerated', (await call('GET', '/v1/me/', { key: adminKey })).status === 200);

console.log(`\napi: ${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log('   - ' + f));
process.exit(failures.length ? 1 : 0);
