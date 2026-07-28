// KVNamespace stand-in. The parts the Worker uses are put, get and delete.
//
// Note what this fake deliberately does NOT model: KV is eventually consistent,
// so a real read can miss a value written seconds earlier in another region.
// That window is handled in the route (getPayload returns a "still replicating"
// message) and by the client, which retries on the next open. Simulating it
// here would make every test non-deterministic for no added coverage.

export function createFakeKV() {
  const store = new Map();
  return {
    async put(key, value) {
      const bytes =
        value instanceof Uint8Array
          ? new Uint8Array(value)
          : new Uint8Array(await new Blob([value]).arrayBuffer());
      store.set(key, bytes);
    },
    /** Real KV returns null for a missing key rather than throwing. `type`
     *  selects the shape; the Worker asks for 'stream', and Response accepts a
     *  Uint8Array as BodyInit, so this stands in for it. */
    async get(key, type) {
      const bytes = store.get(key);
      if (!bytes) return null;
      if (type === 'arrayBuffer') return bytes.buffer;
      if (type === 'text') return new TextDecoder().decode(bytes);
      return bytes;
    },
    async delete(key) {
      store.delete(key);
    },
    _keys: () => [...store.keys()],
    _size: () => store.size,
  };
}
