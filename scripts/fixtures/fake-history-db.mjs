// In-memory stand-in for src/lib/history-db.ts, which needs IndexedDB.
// Used by scripts/test-sync.mjs.

export const _state = { records: new Map(), index: [] };

export const reset = () => { _state.records.clear(); _state.index = []; };

export const seedLocal = (meta, payload, syncedAt) => {
  _state.records.set(meta.id, { meta, payload });
  _state.index.push({
    id: meta.id, project: meta.project, dataDate: meta.dataDate,
    revision: meta.revision, generatedAt: meta.provenance.generatedAt,
    engineerName: meta.provenance.engineerName, activeMetric: 'pf_p1',
    plantCount: 3, hasCycleData: true, hasNcc: false,
    payloadBytes: payload.byteLength, sha256: meta.payload.sha256, syncedAt,
  });
};

export async function listKnownIds() {
  return new Set(_state.index.map((e) => e.id));
}
export async function listPendingUploads() {
  return _state.index.filter((e) => !e.syncedAt);
}
export async function markSynced(id, syncedAt = new Date().toISOString()) {
  _state.index = _state.index.map((e) => (e.id === id ? { ...e, syncedAt } : e));
}
export async function loadGraphRecord(id) {
  return _state.records.get(id) ?? null;
}
export async function importRemoteRecord(record) {
  if (_state.records.has(record.meta.id)) return null;
  seedLocal(record.meta, record.payload, new Date().toISOString());
  return _state.index[_state.index.length - 1];
}
