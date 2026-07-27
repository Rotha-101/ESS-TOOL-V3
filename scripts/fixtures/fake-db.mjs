// In-memory stand-in for src/lib/db.ts (localforage/IndexedDB).
//
// Every operation awaits a real macrotask, matching IndexedDB's genuinely
// asynchronous behaviour. That is essential: a synchronous fake would hide
// interleaving bugs in read-modify-write sequences, which is exactly what
// scripts/test-history.mjs exists to catch.

const store = new Map();
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function getDBItem(key) {
  await tick();
  return store.has(key) ? store.get(key) : null;
}

export async function setDBItem(key, value) {
  await tick();
  store.set(key, value);
}

export async function removeDBItem(key) {
  await tick();
  store.delete(key);
}

export async function getDBKeys() {
  await tick();
  return [...store.keys()];
}

export const _reset = () => store.clear();
export const _size = () => store.size;
