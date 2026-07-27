// essg-v1 round-trip guard.
//
// Synthetic but realistically shaped telemetry (smooth power curves, slow SOC
// ramps, 50 Hz grid noise, step commands, NaN gaps) so this runs anywhere
// without the multi-gigabyte Data/ folder. Sizing was measured separately
// against real SNTL600 telemetry — see docs/CODEC_SPEC.md.

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));
const N = 86400;

const out = esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'src/lib/graph-codec/index.ts')],
  bundle: true, format: 'esm', write: false, platform: 'neutral',
  mainFields: ['module', 'main'], absWorkingDir: ROOT,
  alias: { '@': path.join(ROOT, 'src') },
});
const codec = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

let pass = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

// Deterministic pseudo-random so failures reproduce.
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function series(kind) {
  const a = new Array(N);
  for (let i = 0; i < N; i++) {
    const day = i / N;
    switch (kind) {
      case 'power':  a[i] = 40 * Math.sin(day * Math.PI * 2) + (rnd() - 0.5) * 0.4; break;
      case 'soc':    a[i] = 30 + 20 * Math.sin(day * Math.PI * 2 - 1) + (rnd() - 0.5) * 0.1; break;
      case 'freq':   a[i] = 50 + (rnd() - 0.5) * 0.06; break;
      case 'volt':   a[i] = 22.8 + (rnd() - 0.5) * 0.3; break;
      case 'step':   a[i] = Math.round((30 * Math.sin(day * Math.PI * 2)) / 5) * 5; break;
      default:       a[i] = NaN;
    }
  }
  // Realistic gaps: a comms dropout and a maintenance window.
  for (let i = 3600; i < 3900; i++) a[i] = NaN;
  for (let i = 50000; i < 50120; i++) a[i] = NaN;
  return a;
}

const FIELD_KIND = {
  pTotal: 'power', pPccPVS: 'power', pPV: 'power', pBESS: 'power', dispatchP: 'power',
  qTotal: 'power', qBess: 'power', cmdQ: 'step', cmdP: 'step', remoteP: 'step',
  soc: 'soc', freq: 'freq', vab: 'volt', vbc: 'volt', vca: 'volt',
};

const evalData = { dataDate: '2026-06-02', timestamps: [] };
for (const f of codec.SERIES_FIELDS) {
  evalData[f] = { plant1: series(FIELD_KIND[f]), plant2: series(FIELD_KIND[f]), plant3: new Array(N).fill(NaN) };
}
for (let i = 0; i < N; i++) evalData.timestamps.push(new Date(2026, 5, 2, 0, 0, i));

console.log('\n=== essg-v1 round-trip ===');
const res = codec.encodeGraphPayload(evalData, ['plant1', 'plant2', 'plant3'], '2026-06-02');
const dec = codec.decodeGraphPayload(res.payload);

check('all-NaN plant3 dropped from the payload',
  !res.storedSeries.some((k) => k.startsWith('plant3.')), res.storedSeries.filter(k => k.startsWith('plant3.')).join(','));
check('both populated plants stored', res.plantCount === 2, String(res.plantCount));
check('sample count preserved', res.sampleCount === N);

let maxErr = 0, worst = '', nanBad = 0, overPrecision = 0, compared = 0;
for (const f of codec.SERIES_FIELDS) {
  const limit = codec.maxQuantizationError(f);
  for (const p of ['plant1', 'plant2', 'plant3']) {
    const a = evalData[f][p], b = dec.series[f][p];
    if (b.length !== N) { failures.push(`${p}.${f} wrong length`); continue; }
    for (let i = 0; i < N; i++) {
      if (isNaN(a[i]) !== isNaN(b[i])) { nanBad++; continue; }
      if (isNaN(a[i])) continue;
      compared++;
      const e = Math.abs(a[i] - b[i]);
      if (e > maxErr) { maxErr = e; worst = `${p}.${f}`; }
      if (e > limit + 1e-9) overPrecision++;
    }
  }
}
check('NaN gaps land in exactly the same places', nanBad === 0, String(nanBad));
check('no value exceeds its declared precision', overPrecision === 0, String(overPrecision));
check('plant3 restored as full-length NaN (panels index it unconditionally)',
  dec.series.pTotal.plant3.length === N && dec.series.pTotal.plant3.every(Number.isNaN));

const ts = codec.rebuildTimestamps('2026-06-02', N);
let tsBad = 0;
for (let i = 0; i < N; i++) if (ts[i].getTime() !== evalData.timestamps[i].getTime()) tsBad++;
check('timestamps regenerated identically (they are never stored)', tsBad === 0, String(tsBad));

check('payload stays under 3 MB', res.payload.byteLength < 3 * 1024 * 1024,
  `${(res.payload.byteLength / 1024 / 1024).toFixed(2)} MB`);

console.log(`\n  payload ${(res.payload.byteLength / 1024 / 1024).toFixed(2)} MB · ${res.storedSeries.length} series · ${compared.toLocaleString()} values · max error ${maxErr.toExponential(2)} (${worst})`);

console.log(`\ncodec: ${pass} passed, ${failures.length} failed`);
failures.forEach((f) => console.log('   - ' + f));
process.exit(failures.length ? 1 : 0);
