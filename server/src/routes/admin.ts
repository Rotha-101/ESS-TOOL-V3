// Access-key administration.
//
// The first admin key is inserted by hand at deploy time (see
// server/scripts/make-key.mjs and DEPLOYMENT.md). There is deliberately no
// bootstrap endpoint: an unauthenticated way to mint an admin key would be the
// weakest point in the whole system.

import type { Identity } from '../lib/auth';
import { badRequest, forbidden, json, newId, notFound, sha256Hex, type Env } from '../lib/http';

const ROLES = ['engineer', 'viewer', 'admin'] as const;

const requireAdmin = (identity: Identity) =>
  identity.role === 'admin' ? null : forbidden('Only an administrator can manage access keys.');

/** POST /v1/admin/keys — issue a key.
 *
 *  The plaintext key is returned exactly once and never stored; only its hash
 *  is kept. If it is lost, issue a new one and revoke the old. */
export async function issueKey(request: Request, env: Env, identity: Identity): Promise<Response> {
  const denied = requireAdmin(identity);
  if (denied) return denied;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest('Expected a JSON body with userName, optional userEmail and role.');
  }

  const userName = typeof body?.userName === 'string' ? body.userName.trim() : '';
  const role = body?.role;
  if (!userName) return badRequest('userName is required.');
  if (!ROLES.includes(role)) return badRequest(`role must be one of: ${ROLES.join(', ')}.`);

  // 32 bytes of CSPRNG, hex encoded.
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('');

  const id = newId();
  await env.DB.prepare(
    `INSERT INTO access_keys (id, key_hash, user_name, user_email, role, created_at)
     VALUES (?,?,?,?,?,?)`,
  )
    .bind(
      id,
      await sha256Hex(key),
      userName,
      typeof body?.userEmail === 'string' ? body.userEmail.trim() : null,
      role,
      new Date().toISOString(),
    )
    .run();

  return json(
    {
      id,
      userName,
      role,
      key,
      notice: 'Store this key now — it is not recoverable and will not be shown again.',
    },
    201,
  );
}

/** GET /v1/admin/keys — who has access. Hashes are never returned. */
export async function listKeys(env: Env, identity: Identity): Promise<Response> {
  const denied = requireAdmin(identity);
  if (denied) return denied;

  const { results } = await env.DB.prepare(
    `SELECT id, user_name AS userName, user_email AS userEmail, role,
            created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt
       FROM access_keys ORDER BY created_at DESC`,
  ).all();

  return json({ keys: results ?? [] });
}

/** DELETE /v1/admin/keys/:id — revoke immediately.
 *
 *  Revoking is a flag rather than a delete so the audit trail survives: records
 *  already published stay attributed to that person. */
export async function revokeKey(env: Env, identity: Identity, keyId: string): Promise<Response> {
  const denied = requireAdmin(identity);
  if (denied) return denied;

  if (keyId === identity.keyId) {
    return badRequest('You cannot revoke the key you are currently using.');
  }

  const result = await env.DB.prepare(
    'UPDATE access_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
  )
    .bind(new Date().toISOString(), keyId)
    .run();

  const changed = (result as any)?.meta?.changes ?? (result as any)?.changes ?? 0;
  if (!changed) return notFound('No active key with that id.');
  return json({ status: 'revoked', id: keyId });
}
