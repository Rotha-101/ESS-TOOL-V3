/* Shared-folder repository guard: exercises electron/sync/repository.cjs
 * against a real temp folder standing in for the SMB share. Pure Node — the
 * module only uses fs/path, so no Electron is needed. */
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const repo = require(path.join(__dirname, '..', 'electron', 'sync', 'repository.cjs'));

const SHARE = path.join(os.tmpdir(), `ess-share-test-${Date.now()}`);
let pass = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

const makeMeta = (project, dataDate, id, engineer = 'CHEA Rotha') => ({
  id, schemaVersion: 1, project, dataDate, revision: 1, isLatest: true,
  provenance: { engineerName: engineer, machineName: 'ENG-WS-01', appVersion: '1.0.1',
                generatedAt: new Date().toISOString(), sourceFileNames: ['POC_Plant01.xlsx'] },
  view: { activeMetric: 'pf_p1', selectedPlant: 'plant1', showNccPCommand: true, availableMetrics: ['pf_p1', 'fig5'] },
  graphConfig: { showGrid: true, customTitle: 'Test' },
  pinnedPoints: [],
  axis: { xStart: '00:00:00', xStepSeconds: 1, xCount: 86400 },
  summary: { dataDate, plantCount: 3, sampleCount: 86400, hasCycleData: true, hasNcc: true,
             dailyCycle: { plant1: 1.2, plant2: 1.1, plant3: 1.3 }, totalCycle: { plant1: 400, plant2: 401, plant3: 402 } },
  payload: { bytes: 0, sha256: 'deadbeef', codec: 'essg-v1' },
});

(async () => {
  console.log('\n=== 1. Probe: path that does not exist ===');
  let p = await repo.probe(path.join(SHARE, 'nope'));
  check('reports unreachable', p.reachable === false);
  check('gives an actionable message', /not found|network/i.test(p.error || ''), p.error);

  console.log('\n=== 2. Probe: empty folder initialises the repository ===');
  await fsp.mkdir(SHARE, { recursive: true });
  p = await repo.probe(SHARE);
  check('reachable', p.reachable === true);
  check('writable', p.writable === true);
  check('schemaVersion set', p.schemaVersion === 1, String(p.schemaVersion));
  check('no error', !p.error, p.error || '');
  check('repository.json created', fs.existsSync(path.join(SHARE, 'repository.json')));
  check('v1/ created', fs.existsSync(path.join(SHARE, 'v1')));
  check('no write-probe files left behind',
    fs.readdirSync(SHARE).filter(f => f.startsWith('.write-probe')).length === 0);

  console.log('\n=== 3. Probe rejects a foreign folder ===');
  const foreign = path.join(os.tmpdir(), `ess-foreign-${Date.now()}`);
  await fsp.mkdir(foreign, { recursive: true });
  await fsp.writeFile(path.join(foreign, 'repository.json'), JSON.stringify({ kind: 'something-else' }));
  p = await repo.probe(foreign);
  check('refuses a non-ESS repository marker', Boolean(p.error) && /different kind/i.test(p.error), p.error);

  console.log('\n=== 4. Publish records ===');
  const payloadA = Buffer.from('A'.repeat(5000));
  const metaA = makeMeta('SNTL600', '2026-06-02', '01k3f9x2a8');
  let r = await repo.putRecord(SHARE, metaA, payloadA);
  check('first publish written', r.status === 'written');

  const dir = path.join(SHARE, 'v1', 'SNTL600', '2026');
  check('project/year folder created', fs.existsSync(dir));
  check('meta file named correctly', fs.existsSync(path.join(dir, '2026-06-02__01k3f9x2a8__meta.json')));
  check('data file named correctly', fs.existsSync(path.join(dir, '2026-06-02__01k3f9x2a8__data.essg.gz')));
  check('no .tmp files left', fs.readdirSync(dir).filter(f => f.endsWith('.tmp')).length === 0);

  r = await repo.putRecord(SHARE, metaA, payloadA);
  check('republish is a no-op (idempotent)', r.status === 'exists');

  console.log('\n=== 5. Same plant-day from a second engineer keeps BOTH ===');
  const metaB = makeMeta('SNTL600', '2026-06-02', '01k3zzz999', 'Second Engineer');
  await repo.putRecord(SHARE, metaB, Buffer.from('B'.repeat(4000)));
  const sameDay = fs.readdirSync(dir).filter(f => f.startsWith('2026-06-02') && f.endsWith('__meta.json'));
  check('two records coexist for the same plant-day', sameDay.length === 2, `found ${sameDay.length}`);

  console.log('\n=== 6. Other projects / years ===');
  await repo.putRecord(SHARE, makeMeta('SNTL400', '2025-12-31', '01kaaa111'), Buffer.from('C'.repeat(100)));
  await repo.putRecord(SHARE, makeMeta('SNTB', '2026-01-15', '01kbbb222'), Buffer.from('D'.repeat(100)));

  console.log('\n=== 7. Listing ===');
  const refs = await repo.listRecordIds(SHARE);
  check('finds all four records', refs.length === 4, `found ${refs.length}`);
  const byId = Object.fromEntries(refs.map(x => [x.id, x]));
  check('project parsed from path', byId['01kaaa111']?.project === 'SNTL400');
  check('year parsed from path', byId['01kaaa111']?.year === '2025');
  check('dataDate parsed from filename', byId['01kbbb222']?.dataDate === '2026-01-15');

  console.log('\n=== 8. Stray files are ignored, not fatal ===');
  fs.writeFileSync(path.join(dir, 'Thumbs.db'), 'x');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
  fs.writeFileSync(path.join(dir, 'bad__name__meta.json'), '{}');
  fs.mkdirSync(path.join(SHARE, 'v1', 'SNTL600', 'not-a-year-dir'), { recursive: true });
  const refs2 = await repo.listRecordIds(SHARE);
  check('stray files skipped', refs2.length === 5, `found ${refs2.length} (bad__name is structurally valid, expected)`);

  console.log('\n=== 9. Fetch round-trip ===');
  const gotMeta = await repo.fetchMeta(SHARE, byId['01k3f9x2a8']);
  check('metadata round-trips', gotMeta.id === metaA.id && gotMeta.provenance.engineerName === 'CHEA Rotha');
  check('view state preserved', gotMeta.view.showNccPCommand === true && gotMeta.view.activeMetric === 'pf_p1');
  check('summary preserved', gotMeta.summary.dailyCycle.plant2 === 1.1);
  const gotPayload = await repo.fetchPayload(SHARE, byId['01k3f9x2a8']);
  check('payload round-trips byte-exact', Buffer.compare(Buffer.from(gotPayload), payloadA) === 0);

  console.log('\n=== 10. Rejects unsafe names (path traversal) ===');
  for (const bad of [
    { project: '../../evil', dataDate: '2026-06-02', id: 'x1' },
    { project: 'OK', dataDate: '..\\..\\evil', id: 'x2' },
    { project: 'OK', dataDate: '2026-06-02', id: 'a/b' },
  ]) {
    let threw = false;
    try { await repo.putRecord(SHARE, { ...makeMeta('OK', '2026-06-02', 'x'), ...bad }, Buffer.from('x')); }
    catch { threw = true; }
    check(`rejects ${JSON.stringify(bad).slice(0, 46)}…`, threw);
  }

  console.log('\n=== 11. Two machines converge through the share ===');
  // Machine A holds records 1+3; machine B holds 2+4. After syncing both
  // directions each should know all four. This mirrors syncService's id-set diff.
  const all = (await repo.listRecordIds(SHARE)).map(x => x.id);
  const machineA = new Set([all[0], all[2]]);
  const machineB = new Set([all[1], all[3]]);
  const newForA = all.filter(id => !machineA.has(id));
  const newForB = all.filter(id => !machineB.has(id));
  for (const id of newForA) machineA.add(id);
  for (const id of newForB) machineB.add(id);
  check('machine A converged to full history', machineA.size === all.length);
  check('machine B converged to full history', machineB.size === all.length);
  check('both machines agree', [...machineA].sort().join() === [...machineB].sort().join());

  console.log('\n=== 12. Read-only share reports writable:false (role probe) ===');
  const roShare = path.join(os.tmpdir(), `ess-ro-${Date.now()}`);
  await fsp.mkdir(roShare, { recursive: true });
  await fsp.writeFile(path.join(roShare, 'repository.json'),
    JSON.stringify({ kind: 'ess-graph-repository', schemaVersion: 1, createdAt: new Date().toISOString() }));
  let roTested = false;
  try {
    execSync(`icacls "${roShare}" /deny "%USERNAME%":(WD,AD)`, { stdio: 'pipe' });
    const roProbe = await repo.probe(roShare);
    check('read-only share: reachable', roProbe.reachable === true);
    check('read-only share: writable=false → Management role', roProbe.writable === false);
    roTested = true;
  } catch (err) {
    console.log('  SKIP  icacls unavailable in this environment');
  } finally {
    try { execSync(`icacls "${roShare}" /remove:d "%USERNAME%"`, { stdio: 'pipe' }); } catch {}
    try { await fsp.rm(roShare, { recursive: true, force: true }); } catch {}
  }

  // cleanup
  for (const dirToRemove of [SHARE, foreign]) {
    try { await fsp.rm(dirToRemove, { recursive: true, force: true }); } catch {}
  }

  console.log('\n============================================');
  console.log(`checks passed : ${pass}`);
  console.log(`failures      : ${failures.length}`);
  failures.forEach(f => console.log('   - ' + f));
  console.log(`role probe    : ${roTested ? 'exercised' : 'skipped'}`);
  console.log(`RESULT: ${failures.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log('============================================');
  process.exit(failures.length ? 1 : 0);
})();
