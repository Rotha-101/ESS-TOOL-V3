// Response helpers. Errors follow RFC 7807 so the desktop client can surface a
// useful message instead of a status code.

export interface Env {
  DB: D1Database;
  /** Gzipped essg-v1 series blocks, keyed by project/date/id. */
  PAYLOADS: KVNamespace;
}

export const json = (data: unknown, status = 200, headers: HeadersInit = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

/** RFC 7807. `detail` is written to be shown directly to a user. */
export function problem(status: number, title: string, detail: string): Response {
  return new Response(
    JSON.stringify({ type: 'about:blank', title, status, detail }),
    { status, headers: { 'content-type': 'application/problem+json; charset=utf-8' } },
  );
}

export const badRequest = (detail: string) => problem(400, 'Bad Request', detail);
export const unauthorized = (detail: string) =>
  new Response(
    JSON.stringify({ type: 'about:blank', title: 'Unauthorized', status: 401, detail }),
    {
      status: 401,
      headers: {
        'content-type': 'application/problem+json; charset=utf-8',
        'www-authenticate': 'Bearer',
      },
    },
  );
export const forbidden = (detail: string) => problem(403, 'Forbidden', detail);
export const notFound = (detail: string) => problem(404, 'Not Found', detail);
export const tooLarge = (detail: string) => problem(413, 'Payload Too Large', detail);
export const serverError = (detail: string) => problem(500, 'Internal Server Error', detail);

/** Hex SHA-256 — used for both access keys and payload integrity. */
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Segments that end up in an R2 object key. Same rule the folder repository
 *  used, and for the same reason: keep traversal and oddities out of keys. */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,64}$/;
export const isSafeSegment = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_SEGMENT.test(value);

/** Time-sortable id, matching the client's createGraphId shape. */
export function newId(): string {
  const time = Date.now().toString(36).padStart(9, '0');
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${time}${rand}`;
}
