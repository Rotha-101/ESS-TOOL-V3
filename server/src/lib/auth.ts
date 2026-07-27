// Access-key authentication.
//
// One key per person, issued by an admin. The key itself is never stored — only
// its SHA-256 — so a copy of the database does not yield working credentials.
// Identity comes from here and is written onto every uploaded record, which is
// what makes attribution trustworthy.

import type { Env } from './http';
import { sha256Hex } from './http';

export type Role = 'engineer' | 'viewer' | 'admin';

export interface Identity {
  keyId: string;
  userName: string;
  userEmail: string | null;
  role: Role;
}

/** Only viewers are read-only; engineers and admins may publish. */
export const canWrite = (identity: Identity): boolean => identity.role !== 'viewer';

/** `last_used_at` is useful for spotting stale or leaked keys, but writing it on
 *  every request would mean a database write per poll. An hour's resolution
 *  answers the question just as well at a fraction of the cost. */
const LAST_USED_RESOLUTION_MS = 60 * 60 * 1000;

export async function authenticate(request: Request, env: Env): Promise<Identity | null> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;

  const keyHash = await sha256Hex(match[1].trim());

  const row = await env.DB.prepare(
    `SELECT id, user_name, user_email, role, last_used_at
       FROM access_keys
      WHERE key_hash = ? AND revoked_at IS NULL`,
  )
    .bind(keyHash)
    .first<{
      id: string;
      user_name: string;
      user_email: string | null;
      role: Role;
      last_used_at: string | null;
    }>();

  if (!row) return null;

  const now = Date.now();
  const last = row.last_used_at ? Date.parse(row.last_used_at) : 0;
  if (!Number.isFinite(last) || now - last > LAST_USED_RESOLUTION_MS) {
    await env.DB.prepare('UPDATE access_keys SET last_used_at = ? WHERE id = ?')
      .bind(new Date(now).toISOString(), row.id)
      .run();
  }

  return {
    keyId: row.id,
    userName: row.user_name,
    userEmail: row.user_email,
    role: row.role,
  };
}
