// HTTPS client for the graph repository service.
//
// Replaces repository.cjs (which spoke to an SMB folder) behind the same IPC
// channels, so the renderer barely changed. Network I/O stays in the main
// process for the same reason file I/O did: it is where the access key lives,
// and the key must never reach the renderer.
//
// Every function resolves rather than throws — an unreachable service is an
// ordinary condition (no internet) that the UI reports, not an exception.

const credentials = require('./credentials.cjs');

/** Long enough for a 0.84 MB payload on a poor plant-site link, short enough
 *  that a black-holed connection does not hang the sync loop indefinitely. */
const TIMEOUT_MS = 60_000;

const normalizeBase = (url) => String(url || '').trim().replace(/\/+$/, '');

function endpoint(baseUrl, pathname) {
  const base = normalizeBase(baseUrl);
  if (!base) throw new Error('No server URL configured.');
  if (!/^https?:\/\//i.test(base)) {
    throw new Error('Server URL must start with https:// (or http:// for local testing).');
  }
  return `${base}/v1${pathname}`;
}

async function request(baseUrl, pathname, { method = 'GET', body, headers = {} } = {}) {
  const key = credentials.getKey();
  if (!key) throw new Error('No access key configured.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(endpoint(baseUrl, pathname), {
      method,
      headers: { authorization: `Bearer ${key}`, ...headers },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Turn a non-2xx response into a message worth showing a user. The service
 *  speaks RFC 7807, so `detail` is already written for that. */
async function describeFailure(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.detail || body?.title || '';
  } catch { /* not JSON */ }

  if (res.status === 401) return detail || 'Access key rejected. Check the key in Settings.';
  if (res.status === 403) return detail || 'Your account does not have permission for this action.';
  if (res.status === 404) return detail || 'Not found on the server.';
  return detail || `Server returned ${res.status}.`;
}

/** Network-level failures, worded so a user can act on them. */
function describeNetworkError(err) {
  if (err?.name === 'AbortError') return 'The server did not respond in time.';
  const message = err?.message || String(err);
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return 'Server not found. Check the server URL and your internet connection.';
  }
  if (/ECONNREFUSED/i.test(message)) return 'Connection refused by the server.';
  if (/certificate|SSL|TLS/i.test(message)) return 'The server certificate could not be verified.';
  if (/fetch failed/i.test(message)) return 'Could not reach the server. Check your internet connection.';
  return message;
}

/**
 * Reachability plus the one fact the read-only rule needs.
 *
 * `writable` comes from the account's role, exactly as it previously came from
 * the file share's permissions — which is why the whole Management read-only
 * experience works unchanged.
 */
async function probe(baseUrl) {
  if (!normalizeBase(baseUrl)) {
    return { reachable: false, writable: false, error: 'No server URL configured.' };
  }
  if (!credentials.hasKey()) {
    return { reachable: false, writable: false, error: 'No access key configured. Paste the key you were issued.' };
  }

  try {
    const res = await request(baseUrl, '/me');
    if (!res.ok) {
      return { reachable: res.status !== 404, writable: false, error: await describeFailure(res) };
    }
    const me = await res.json();
    return {
      reachable: true,
      writable: Boolean(me.writable),
      schemaVersion: me.schemaVersion ?? null,
      userName: me.userName ?? null,
      role: me.role ?? null,
      error: null,
    };
  } catch (err) {
    return { reachable: false, writable: false, error: describeNetworkError(err) };
  }
}

async function listRecordIds(baseUrl) {
  const res = await request(baseUrl, '/graphs/ids');
  if (!res.ok) throw new Error(await describeFailure(res));
  const body = await res.json();
  return body.records ?? [];
}

async function fetchMeta(baseUrl, ref) {
  const res = await request(baseUrl, `/graphs/${encodeURIComponent(ref.id)}`);
  if (!res.ok) throw new Error(await describeFailure(res));
  return res.json();
}

async function fetchPayload(baseUrl, ref) {
  const res = await request(baseUrl, `/graphs/${encodeURIComponent(ref.id)}/payload`);
  if (!res.ok) throw new Error(await describeFailure(res));
  return new Uint8Array(await res.arrayBuffer());
}

async function putRecord(baseUrl, meta, payload) {
  const form = new FormData();
  form.set('meta', JSON.stringify(meta));
  form.set('payload', new Blob([payload], { type: 'application/octet-stream' }), `${meta.id}.essg.gz`);

  const res = await request(baseUrl, '/graphs', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await describeFailure(res));
  const body = await res.json();
  return { status: body.status ?? 'written', id: body.id ?? meta.id };
}

module.exports = { probe, listRecordIds, fetchMeta, fetchPayload, putRecord, describeNetworkError };
