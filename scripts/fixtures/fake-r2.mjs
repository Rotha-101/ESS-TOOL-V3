// R2Bucket stand-in. Object storage is a key/value map; the parts the Worker
// uses are put, get, head and delete.

export function createFakeR2() {
  const store = new Map();
  return {
    async put(key, value, options = {}) {
      const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(await new Blob([value]).arrayBuffer());
      store.set(key, { bytes, httpMetadata: options.httpMetadata ?? {} });
      return { key, size: bytes.byteLength };
    },
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      // Response accepts a Uint8Array as BodyInit, so this stands in for the
      // ReadableStream the real binding returns.
      return { key, size: entry.bytes.byteLength, body: entry.bytes, httpMetadata: entry.httpMetadata };
    },
    async head(key) {
      const entry = store.get(key);
      return entry ? { key, size: entry.bytes.byteLength } : null;
    },
    async delete(key) {
      store.delete(key);
    },
    _keys: () => [...store.keys()],
    _size: () => store.size,
  };
}
