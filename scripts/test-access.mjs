/* Access-mode guard: the read-only decision table. Engineers must never be
 * locked out; Management must never see write controls. */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));

const out = esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'src/features/graph-repository/accessMode.ts')],
  bundle: true, format: 'esm', write: false, platform: 'neutral',
  mainFields: ['module', 'main'], absWorkingDir: ROOT,
  alias: { '@': path.join(ROOT, 'src') },
  external: ['react', 'zustand', 'zustand/middleware'],
});
const { decideReadOnly } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

// Activation replaces the old "is a server URL configured" input. The truth
// table below is unchanged: enrolled:false means exactly what serverUrl:""
// used to — no relationship with a service, therefore full local access.
const ENROLLED = true;
let pass = 0; const failures = [];
const check = (name, actual, expected) => {
  if (actual === expected) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name} — expected ${expected}, got ${actual}`); }
};

console.log('\n=== Engineer scenarios (must NEVER be locked out) ===');
check('not activated → full access',
  decideReadOnly({ enrolled: false, syncEnabled: true, phase: 'idle', writable: false, lastKnownWritable: false }), false);
check('sync switched off → full access (escape hatch)',
  decideReadOnly({ enrolled: ENROLLED, syncEnabled: false, phase: 'ok', writable: false, lastKnownWritable: false }), false);
check('writable account, confirmed → full access',
  decideReadOnly({ enrolled: ENROLLED, syncEnabled: true, phase: 'ok', writable: true, lastKnownWritable: true }), false);
check('engineer offline (was writable) → full access, keeps working',
  decideReadOnly({ enrolled: ENROLLED, syncEnabled: true, phase: 'offline', writable: false, lastKnownWritable: true }), false);
check('engineer first launch, not probed yet → full access',
  decideReadOnly({ enrolled: ENROLLED, syncEnabled: true, phase: 'idle', writable: false, lastKnownWritable: true }), false);
check('engineer mid-sync → full access',
  decideReadOnly({ enrolled: ENROLLED, syncEnabled: true, phase: 'syncing', writable: false, lastKnownWritable: true }), false);
check('server reachable with record failures, still writable → full access',
  decideReadOnly({ enrolled: ENROLLED, syncEnabled: true, phase: 'error', writable: true, lastKnownWritable: true }), false);

console.log('\n=== Top Management scenarios (must be read-only) ===');
check('read-only account, confirmed → read only',
  decideReadOnly({ enrolled: ENROLLED, syncEnabled: true, phase: 'ok', writable: false, lastKnownWritable: false }), true);
check('read-only account with record failures → read only',
  decideReadOnly({ enrolled: ENROLLED, syncEnabled: true, phase: 'error', writable: false, lastKnownWritable: false }), true);
check('management launch before first probe → read only (no UI flash)',
  decideReadOnly({ enrolled: ENROLLED, syncEnabled: true, phase: 'idle', writable: false, lastKnownWritable: false }), true);
check('management mid-sync → stays read only',
  decideReadOnly({ enrolled: ENROLLED, syncEnabled: true, phase: 'syncing', writable: false, lastKnownWritable: false }), true);
check('management offline → stays read only',
  decideReadOnly({ enrolled: ENROLLED, syncEnabled: true, phase: 'offline', writable: false, lastKnownWritable: false }), true);

console.log('\n=== Permission changes take effect on the next probe ===');
check('engineer demoted to read-only → locks once confirmed',
  decideReadOnly({ enrolled: ENROLLED, syncEnabled: true, phase: 'ok', writable: false, lastKnownWritable: true }), true);
check('manager promoted to writable → unlocks once confirmed',
  decideReadOnly({ enrolled: ENROLLED, syncEnabled: true, phase: 'ok', writable: true, lastKnownWritable: false }), false);

console.log('\n============================================');
console.log(`checks passed : ${pass}`);
console.log(`failures      : ${failures.length}`);
failures.forEach(f => console.log('   - ' + f));
console.log(`RESULT: ${failures.length === 0 ? 'PASS' : 'FAIL'}`);
console.log('============================================');
process.exit(failures.length ? 1 : 0);
