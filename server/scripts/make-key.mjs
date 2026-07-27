/* Mint the FIRST admin access key.
 *
 * There is intentionally no bootstrap endpoint — an unauthenticated way to
 * create an admin key would be the weakest point in the system. So the first
 * key is inserted by hand, once, and every later key is issued through
 * POST /v1/admin/keys using it.
 *
 *   node scripts/make-key.mjs "CHEA Rotha" admin rotha@example.com
 *
 * Prints the key (store it now — only its hash is ever kept) and the SQL to run.
 */
import crypto from 'node:crypto';

const [, , userName, role = 'admin', userEmail = ''] = process.argv;

if (!userName) {
  console.error('Usage: node scripts/make-key.mjs "<User Name>" [engineer|viewer|admin] [email]');
  process.exit(1);
}
if (!['engineer', 'viewer', 'admin'].includes(role)) {
  console.error(`Invalid role "${role}". Must be engineer, viewer or admin.`);
  process.exit(1);
}

const key = crypto.randomBytes(32).toString('hex');
const keyHash = crypto.createHash('sha256').update(key).digest('hex');
const id = Date.now().toString(36).padStart(9, '0') + crypto.randomBytes(6).toString('hex');
const now = new Date().toISOString();
const sqlStr = (v) => (v ? `'${String(v).replace(/'/g, "''")}'` : 'NULL');

console.log(`
──────────────────────────────────────────────────────────────
ACCESS KEY for ${userName} (${role})

  ${key}

Give this to the user; it is shown once and cannot be recovered.
Only its SHA-256 is stored, so the database never holds a usable
credential.
──────────────────────────────────────────────────────────────

Run this to register it:

wrangler d1 execute ess-graph-repository --remote --command "INSERT INTO access_keys (id, key_hash, user_name, user_email, role, created_at) VALUES ('${id}', '${keyHash}', ${sqlStr(userName)}, ${sqlStr(userEmail)}, '${role}', '${now}');"

(add --local instead of --remote to seed a local dev database)
`);
