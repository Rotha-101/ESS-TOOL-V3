// In-memory stand-in for src/lib/history-db.ts, which needs IndexedDB.
// Used by scripts/test-sync.mjs.
//
// Payloads are optional here, exactly as they are in the real store: a synced
// record holds metadata only until someone opens it.

export const _state = { records: new Map(), index: [] };

export const reset = () => { _state.records.clear(); _state.index = []; };

export const seedLocal = (meta, payload, syncedAt, origin = 'local') => {
  _state.records.set(meta.id, { meta, payload: payload ?? null });
  _state.index.push({
    id: meta.id, project: meta.project, dataDate: meta.dataDate,
    revision: meta.revision, generatedAt: meta.provenance.generatedAt,
    engineerName: meta.provenance.engineerName, activeMetric: 'pf_p1',
    plantCount: 3, hasCycleData: true, hasNcc: false,
    payloadBytes: meta.payload.bytes, sha256: meta.payload.sha256, syncedAt,
    payloadCached: Boolean(payload),
    origin,
  });
};

export async function listGraphHistory() {
  return _state.index;
}
export const isLocallyGenerated = (e) =>
  e.origin ? e.origin === 'local' : Boolean(e.signature);
export async function clearSynced(id) {
  _state.index = _state.index.map((e) => (e.id === id ? { ...e, syncedAt: undefined } : e));
}

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
  const rec = _state.records.get(id);
  // A metadata-only record is not a loadable record.
  return rec && rec.payload ? rec : null;
}
export async function loadGraphMeta(id) {
  return _state.records.get(id)?.meta ?? null;
}
export async function importRemoteRecord(record) {
  if (_state.records.has(record.meta.id)) return null;
  seedLocal(record.meta, record.payload, new Date().toISOString(), 'remote');
  return _state.index[_state.index.length - 1];
}
export async function importRemoteMeta(meta) {
  if (_state.records.has(meta.id)) return null;
  seedLocal(meta, null, new Date().toISOString(), 'remote');
  return _state.index[_state.index.length - 1];
}
export async function putPayload(id, payload) {
  const rec = _state.records.get(id);
  if (rec) rec.payload = payload;
  _state.index = _state.index.map((e) => (e.id === id ? { ...e, payloadCached: true } : e));
}
export async function hasPayload(id) {
  return Boolean(_state.records.get(id)?.payload);
}
