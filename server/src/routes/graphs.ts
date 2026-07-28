// Graph records: list, fetch, publish.
//
// These four handlers are the server side of the client's SyncTransport, one
// for one.

import { canWrite, type Identity } from '../lib/auth';
import {
  badRequest,
  forbidden,
  isSafeSegment,
  json,
  notFound,
  serverError,
  sha256Hex,
  tooLarge,
  type Env,
} from '../lib/http';

/** Generous next to a measured 0.84 MB, but bounded so a bad client cannot
 *  push arbitrary data into storage. Capped at KV's own 25 MiB value limit —
 *  above this the write fails at the platform rather than here, with a much
 *  worse message. */
const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;

const payloadKey = (project: string, dataDate: string, id: string) =>
  `graphs/${project}/${dataDate}/${id}.essg.gz`;

/** GET /v1/graphs/ids — the sync cursor.
 *
 *  Deliberately returns every id with no pagination: the client's cursor is the
 *  set of ids it already holds, which depends on no clock anywhere. At ~40
 *  bytes per row, a decade of history is a few hundred KB before compression,
 *  and Cloudflare does not bill response egress. */
export async function listIds(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT id, project, data_date AS dataDate FROM graphs ORDER BY data_date DESC',
  ).all<{ id: string; project: string; dataDate: string }>();

  return json({ records: results ?? [] });
}

/** GET /v1/graphs/:id */
export async function getMeta(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT meta_json FROM graphs WHERE id = ?')
    .bind(id)
    .first<{ meta_json: string }>();

  if (!row) return notFound('No graph with that id.');
  return new Response(row.meta_json, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** GET /v1/graphs/:id/payload
 *
 *  Content-Encoding is deliberately NOT set. The payload is gzipped by the
 *  essg-v1 codec and the client gunzips it itself; declaring the encoding would
 *  make fetch transparently decompress it and the decoder would then be handed
 *  bytes it cannot read. */
export async function getPayload(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    'SELECT payload_key, payload_bytes, payload_sha256 FROM graphs WHERE id = ?',
  )
    .bind(id)
    .first<{ payload_key: string; payload_bytes: number; payload_sha256: string }>();

  if (!row) return notFound('No graph with that id.');

  // KV is eventually consistent, so a graph published seconds ago in another
  // region can be listed (D1 is strongly consistent) before its payload is
  // readable here. Say so plainly: the client retries on the next open, and
  // "not replicated yet" is a very different problem from "data lost".
  const object = await env.PAYLOADS.get(row.payload_key, 'stream');
  if (!object) {
    return serverError(
      'The graph data is not available yet — it may still be replicating. Try again in a minute.',
    );
  }

  return new Response(object, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(row.payload_bytes),
      etag: row.payload_sha256,
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
}

/** POST /v1/graphs — multipart/form-data with `meta` (JSON) and `payload` (blob).
 *
 *  Idempotent on (project, dataDate, sha256): re-publishing an unchanged graph
 *  returns the existing record rather than creating a duplicate, which is what
 *  happens whenever a client retries after an interrupted upload. */
export async function publish(request: Request, env: Env, identity: Identity): Promise<Response> {
  if (!canWrite(identity)) {
    return forbidden('Your account has read-only access and cannot publish graphs.');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest('Expected multipart/form-data with "meta" and "payload" parts.');
  }

  const metaRaw = form.get('meta');
  const payloadPart = form.get('payload');
  if (typeof metaRaw !== 'string' || !payloadPart || typeof payloadPart === 'string') {
    return badRequest('Both a "meta" JSON part and a binary "payload" part are required.');
  }

  let meta: any;
  try {
    meta = JSON.parse(metaRaw);
  } catch {
    return badRequest('The "meta" part is not valid JSON.');
  }

  // Structure first. Without this a well-formed-but-wrong document could reach
  // storage and only fail much later, on the machine that opened it.
  if (!isSafeSegment(meta?.id) || !isSafeSegment(meta?.project) || !isSafeSegment(meta?.dataDate)) {
    return badRequest('id, project and dataDate must each be a simple name (letters, digits, dot, dash, underscore).');
  }
  if (typeof meta?.payload?.sha256 !== 'string' || typeof meta?.payload?.codec !== 'string') {
    return badRequest('Metadata is missing payload.sha256 or payload.codec.');
  }
  if (typeof meta?.provenance?.generatedAt !== 'string') {
    return badRequest('Metadata is missing provenance.generatedAt.');
  }

  const bytes = new Uint8Array(await (payloadPart as Blob).arrayBuffer());
  if (bytes.byteLength === 0) return badRequest('The payload is empty.');
  if (bytes.byteLength > MAX_PAYLOAD_BYTES) {
    return tooLarge(`Payload exceeds the ${MAX_PAYLOAD_BYTES / 1024 / 1024} MB limit.`);
  }

  // Verify what actually arrived, not what the metadata claims. This is the
  // check the folder design could not make, because it had no server.
  const actualSha = await sha256Hex(bytes);
  if (actualSha !== meta.payload.sha256) {
    return badRequest('Payload checksum does not match the metadata — the upload may be incomplete.');
  }

  // Already have this exact graph?
  const existing = await env.DB.prepare(
    'SELECT id FROM graphs WHERE project = ? AND data_date = ? AND payload_sha256 = ?',
  )
    .bind(meta.project, meta.dataDate, actualSha)
    .first<{ id: string }>();
  if (existing) return json({ status: 'exists', id: existing.id });

  const byId = await env.DB.prepare('SELECT id FROM graphs WHERE id = ?')
    .bind(meta.id)
    .first<{ id: string }>();
  if (byId) return json({ status: 'exists', id: byId.id });

  // Identity is taken from the access key, never from the client. An engineer
  // cannot publish under someone else's name by editing local settings.
  const uploadedAt = new Date().toISOString();
  meta.provenance = {
    ...meta.provenance,
    engineerName: identity.userName,
    engineerEmail: identity.userEmail ?? undefined,
    uploadedAt,
  };

  const key = payloadKey(meta.project, meta.dataDate, meta.id);
  await env.PAYLOADS.put(key, bytes);

  try {
    await env.DB.prepare(
      `INSERT INTO graphs (
         id, project, data_date, revision,
         user_id, engineer_name, machine_name,
         app_version, generated_at, uploaded_at,
         meta_json, payload_key, payload_bytes, payload_sha256, payload_codec
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        meta.id,
        meta.project,
        meta.dataDate,
        Number(meta.revision) || 1,
        identity.keyId,
        identity.userName,
        meta.provenance.machineName ?? null,
        meta.provenance.appVersion ?? null,
        meta.provenance.generatedAt,
        uploadedAt,
        JSON.stringify(meta),
        key,
        bytes.byteLength,
        actualSha,
        meta.payload.codec,
      )
      .run();
  } catch (err: any) {
    // Metadata is the record of truth; an orphaned value would be listed by
    // nothing and served to no one, so remove it rather than leave litter.
    await env.PAYLOADS.delete(key).catch(() => undefined);
    return serverError(`Could not record the graph: ${err?.message ?? String(err)}`);
  }

  return json({ status: 'written', id: meta.id }, 201);
}
