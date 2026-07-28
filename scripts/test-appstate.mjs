/* Application state guard.
 *
 * One state, derived from every input at once. The bug this replaces: a
 * "View only" badge that appeared whenever the network dropped, because
 * `writable` was forced false while offline and a separate piece of UI read it
 * without that context. Contradictions like that are unrepresentable here, but
 * only if the priority order stays correct — which is what this file pins. */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));

const out = esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'src/lib/appState.ts')],
  bundle: true, format: 'esm', write: false, platform: 'neutral',
  mainFields: ['module', 'main'], absWorkingDir: ROOT,
  alias: { '@': path.join(ROOT, 'src') },
});
const { decideAppState } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);

let pass = 0; const failures = [];
const check = (name, actual, expected) => {
  if (actual === expected) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name} — expected ${expected}, got ${actual}`); }
};

const base = { activation: 'active', syncEnabled: true, phase: 'ok', hasFailures: false };
const state = (over) => decideAppState({ ...base, ...over }).state;
const policy = (over) => decideAppState({ ...base, ...over });

console.log('\n=== Activation outranks everything ===');
check('unknown → starting', state({ activation: 'unknown' }), 'starting');
check('no credential → activation required', state({ activation: 'none' }), 'activation_required');
check('pending approval → activation required', state({ activation: 'pending' }), 'activation_required');
check('revoked → rejected', state({ activation: 'rejected' }), 'activation_rejected');
check('revoked even while offline', state({ activation: 'rejected', phase: 'offline' }), 'activation_rejected');
check('unknown does not leak a shell', policy({ activation: 'unknown' }).showShell, false);
check('rejected does not leak a shell', policy({ activation: 'rejected' }).showShell, false);

console.log('\n=== A deliberate local mode is not a failure ===');
check('sync off → local only', state({ syncEnabled: false }), 'local_only');
check('sync off while offline → still local only, not "offline"',
  state({ syncEnabled: false, phase: 'offline' }), 'local_only');
check('sync off while failing → still local only',
  state({ syncEnabled: false, phase: 'error', hasFailures: true }), 'local_only');
check('local only still shows the app', policy({ syncEnabled: false }).showShell, true);

console.log('\n=== Normal operation ===');
check('connected and idle → ready', state({}), 'ready');
check('mid-pass → syncing', state({ phase: 'syncing' }), 'syncing');
check('unreachable → offline', state({ phase: 'offline' }), 'offline');
check('record failures → needs attention', state({ hasFailures: true }), 'needs_attention');
check('error phase → needs attention', state({ phase: 'error' }), 'needs_attention');

console.log('\n=== Offline must never stop work, or stop the queue draining ===');
check('offline still shows the app', policy({ phase: 'offline' }).showShell, true);
check('offline still permits uploads (queue drains on reconnect)',
  policy({ phase: 'offline' }).uploadsAllowed, true);
check('offline message is plain and reassuring',
  /saved on this computer/i.test(policy({ phase: 'offline' }).message), true);
check('offline is not alarming', policy({ phase: 'offline' }).tone, 'neutral');

console.log('\n=== No technical vocabulary reaches the user ===');
const forbidden = /repositor|payload|probe|schema|transport|sync(hronis|hroniz)ation failed|phase|writable|HTTP|token/i;
for (const a of ['unknown', 'none', 'active', 'pending', 'rejected']) {
  for (const p of ['idle', 'syncing', 'ok', 'offline', 'error']) {
    for (const e of [true, false]) {
      const m = decideAppState({ activation: a, syncEnabled: e, phase: p, hasFailures: false }).message;
      if (forbidden.test(m)) {
        failures.push(`jargon leaked: "${m}"`);
        console.log(`  FAIL  jargon in ${a}/${p}/${e}: "${m}"`);
      }
    }
  }
}
if (!failures.some((f) => f.startsWith('jargon'))) {
  pass++; console.log('  PASS  every message across all 50 input combinations is jargon-free');
}

console.log('\n============================================');
console.log(`checks passed : ${pass}`);
console.log(`failures      : ${failures.length}`);
failures.forEach(f => console.log('   - ' + f));
console.log(`RESULT: ${failures.length === 0 ? 'PASS' : 'FAIL'}`);
console.log('============================================');
process.exit(failures.length ? 1 : 0);
