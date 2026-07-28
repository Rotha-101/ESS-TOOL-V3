// Shared Graph Repository — Cloudflare Worker.
//
// The server side of the desktop app's SyncTransport. Small on purpose: a
// handful of routes over D1 (metadata) and R2 (payloads), with no framework.
//
// Every route except /v1/health requires a valid access key. There is no public
// read: graph history is company data.

import { authenticate, canWrite } from './lib/auth';
import { json, notFound, serverError, unauthorized, type Env } from './lib/http';
import { getMeta, getPayload, listIds, publish } from './routes/graphs';
import { issueKey, listKeys, revokeKey } from './routes/admin';

export const SCHEMA_VERSION = 1;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (err: any) {
      // Never leak a stack trace to a client; the message is enough to act on.
      return serverError(err?.message ?? 'Unexpected error.');
    }
  },
};

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  // Liveness, unauthenticated: lets an admin distinguish "service down" from
  // "my key is wrong" without holding a valid key.
  if (path === '/v1/health') {
    const checks = { db: false, storage: false };
    try {
      await env.DB.prepare('SELECT 1').first();
      checks.db = true;
    } catch { /* reported below */ }
    try {
      await env.PAYLOADS.get('___healthcheck___');
      checks.storage = true;
    } catch { /* a miss on an absent key still proves reachability */ }
    return json({ status: checks.db ? 'ok' : 'degraded', schemaVersion: SCHEMA_VERSION, ...checks });
  }

  const identity = await authenticate(request, env);
  if (!identity) {
    return unauthorized('A valid access key is required. Paste yours in Settings → Graph Repository.');
  }

  // probe(): identity plus the single fact the client's read-only rule needs.
  if (path === '/v1/me' && method === 'GET') {
    return json({
      userName: identity.userName,
      userEmail: identity.userEmail,
      role: identity.role,
      writable: canWrite(identity),
      schemaVersion: SCHEMA_VERSION,
    });
  }

  if (path === '/v1/graphs/ids' && method === 'GET') return listIds(env);
  if (path === '/v1/graphs' && method === 'POST') return publish(request, env, identity);

  const payloadMatch = /^\/v1\/graphs\/([A-Za-z0-9._-]{1,64})\/payload$/.exec(path);
  if (payloadMatch && method === 'GET') return getPayload(env, payloadMatch[1]);

  const metaMatch = /^\/v1\/graphs\/([A-Za-z0-9._-]{1,64})$/.exec(path);
  if (metaMatch && method === 'GET') return getMeta(env, metaMatch[1]);

  if (path === '/v1/admin/keys' && method === 'POST') return issueKey(request, env, identity);
  if (path === '/v1/admin/keys' && method === 'GET') return listKeys(env, identity);

  const keyMatch = /^\/v1\/admin\/keys\/([A-Za-z0-9._-]{1,64})$/.exec(path);
  if (keyMatch && method === 'DELETE') return revokeKey(env, identity, keyMatch[1]);

  return notFound(`No route for ${method} ${path}.`);
}
