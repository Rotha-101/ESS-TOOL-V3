// Append-only local store for generated Daily Evaluation Graphs.
//
// Fixes the defect this whole feature rests on: useEvalData persists the
// working dataset to a SINGLE slot per project (eval_data_${project}), so
// generating today's graph destroyed yesterday's. That slot stays exactly as
// it was — it is the live working set — and this module keeps the durable
// history beside it.
//
// Three key families in the existing localforage store:
//   graph_index            compact list rows (id, project, date, who, size)
//   graph_meta_{id}        full GraphRecordMeta (config, pins, summary)
//   graph_payload_{id}     gzipped essg-v1 series block
//
// The index is deliberately separate from the metadata: the repository list
// reads it on every open, and pulling several thousand full metadata objects
// (graphConfig + pins + summary each) just to render a table would be the same
// mistake the Database tab already warns about for evaluation datasets.

import { getDBItem, removeDBItem, setDBItem } from '@/lib/db';
import type { GraphRecord, GraphRecordMeta } from '@/lib/graph-codec';

const INDEX_KEY = 'graph_index';
const META_PREFIX = 'graph_meta_';
const PAYLOAD_PREFIX = 'graph_payload_';

/** The columns the repository list actually renders. Kept small on purpose. */
export interface GraphHistoryEntry {
  id: string;
  project: string;
  dataDate: string;
  revision: number;
  generatedAt: string;
  engineerName: string;
  activeMetric: string;
  plantCount: number;
  hasCycleData: boolean;
  hasNcc: boolean;
  payloadBytes: number;
  sha256: string;
  /** Cheap sampled fingerprint of the source dataset. Lets the auto-save hook
   *  recognise an already-captured dataset without paying for a full encode —
   *  the sha256 above is only knowable after encoding. */
  signature?: string;
  /** Set once the sync agent confirms the server accepted it (Phase 3). */
  syncedAt?: string;
}

const toEntry = (meta: GraphRecordMeta): GraphHistoryEntry => ({
  id: meta.id,
  project: meta.project,
  dataDate: meta.dataDate,
  revision: meta.revision,
  generatedAt: meta.provenance.generatedAt,
  engineerName: meta.provenance.engineerName,
  activeMetric: meta.view.activeMetric,
  plantCount: meta.summary.plantCount,
  hasCycleData: meta.summary.hasCycleData,
  hasNcc: meta.summary.hasNcc,
  payloadBytes: meta.payload.bytes,
  sha256: meta.payload.sha256,
});

async function readIndex(): Promise<GraphHistoryEntry[]> {
  return (await getDBItem<GraphHistoryEntry[]>(INDEX_KEY)) ?? [];
}

async function writeIndex(entries: GraphHistoryEntry[]): Promise<void> {
  // Newest first — the order the repository list wants, computed once on write
  // rather than on every read.
  entries.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : a.generatedAt > b.generatedAt ? -1 : 0));
  await setDBItem(INDEX_KEY, entries);
}

/**
 * Serialises every read-modify-write of the index.
 *
 * The index is one IndexedDB key mutated from two independent places: auto-save
 * when an engineer generates a graph, and the sync loop when it imports
 * records. Both read it, modify it and write it back, and IndexedDB is
 * genuinely asynchronous — so without this, two overlapping mutations each
 * start from the same snapshot and the last write silently discards the
 * other's entry. The record itself survives in storage but disappears from the
 * list, and is never published.
 *
 * A promise chain rather than a lock library: mutations are rare (a handful a
 * day) and always short, so queueing them costs nothing measurable.
 */
let indexQueue: Promise<unknown> = Promise.resolve();

function withIndexLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = indexQueue.then(operation, operation);
  // Keep the chain alive even if this operation rejects.
  indexQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function listGraphHistory(): Promise<GraphHistoryEntry[]> {
  return readIndex();
}

/** Has this exact dataset already been captured? Checked before encoding, so a
 *  reload that restores the working set does not re-encode ~2.5M samples only
 *  to find the record already exists. */
export async function hasSignature(
  project: string,
  dataDate: string,
  signature: string,
): Promise<boolean> {
  const index = await readIndex();
  return index.some(
    (e) => e.project === project && e.dataDate === dataDate && e.signature === signature,
  );
}

export type SaveOutcome =
  | { status: 'saved'; entry: GraphHistoryEntry }
  | { status: 'duplicate'; entry: GraphHistoryEntry };

/**
 * Persist a generated graph.
 *
 * Two engineers — or the same engineer twice — may legitimately process the
 * same plant-day, so `(project, dataDate)` is not unique: a genuinely new
 * dataset becomes revision N+1 and the previous revisions are kept. A byte
 * identical re-save (same payload hash) is recognised and skipped, which is
 * what happens when the user merges NCC data and nothing numeric changed, or
 * simply revisits the tab.
 */
export async function saveGraphRecord(
  record: GraphRecord,
  signature?: string,
): Promise<SaveOutcome> {
  return withIndexLock(async () => {
    const index = await readIndex();

    const duplicate = index.find(
      (e) =>
        e.project === record.meta.project &&
        e.dataDate === record.meta.dataDate &&
        e.sha256 === record.meta.payload.sha256,
    );
    if (duplicate) return { status: 'duplicate', entry: duplicate };

    const siblings = index.filter(
      (e) => e.project === record.meta.project && e.dataDate === record.meta.dataDate,
    );
    const revision = siblings.reduce((max, e) => Math.max(max, e.revision), 0) + 1;

    const meta: GraphRecordMeta = { ...record.meta, revision, isLatest: true };

    // Record first, index last: a crash between the two leaves an orphaned
    // record, which is recoverable. The reverse would leave the list pointing
    // at something that does not exist.
    await setDBItem(`${PAYLOAD_PREFIX}${meta.id}`, record.payload);
    await setDBItem(`${META_PREFIX}${meta.id}`, meta);

    const entry: GraphHistoryEntry = { ...toEntry(meta), signature };
    await writeIndex([...index, entry]);
    return { status: 'saved', entry };
  });
}

/**
 * Store a record that came from the shared repository.
 *
 * Unlike saveGraphRecord this preserves the incoming metadata verbatim — id,
 * revision and provenance belong to the engineer who generated it, and
 * renumbering them here would make the same graph look different on every
 * machine that downloaded it.
 */
export async function importRemoteRecord(record: GraphRecord): Promise<GraphHistoryEntry> {
  return withIndexLock(async () => {
    const index = await readIndex();
    const existing = index.find((e) => e.id === record.meta.id);
    if (existing) return existing;

    await setDBItem(`${PAYLOAD_PREFIX}${record.meta.id}`, record.payload);
    await setDBItem(`${META_PREFIX}${record.meta.id}`, record.meta);

    const entry: GraphHistoryEntry = { ...toEntry(record.meta), syncedAt: new Date().toISOString() };
    await writeIndex([...index, entry]);
    return entry;
  });
}

/** Records generated here that the shared repository has not accepted yet.
 *  Phase 1 already persists every generated graph, so this IS the outbox —
 *  there is no second queue to keep consistent. */
export async function listPendingUploads(): Promise<GraphHistoryEntry[]> {
  return (await readIndex()).filter((e) => !e.syncedAt);
}

export async function markSynced(id: string, syncedAt = new Date().toISOString()): Promise<void> {
  return withIndexLock(async () => {
    const index = await readIndex();
    await writeIndex(index.map((e) => (e.id === id ? { ...e, syncedAt } : e)));
  });
}

/** Ids already held locally. The sync cursor is this set rather than a
 *  timestamp, so nothing depends on the file server's or workstation's clock. */
export async function listKnownIds(): Promise<Set<string>> {
  return new Set((await readIndex()).map((e) => e.id));
}

export async function loadGraphRecord(id: string): Promise<GraphRecord | null> {
  const meta = await getDBItem<GraphRecordMeta>(`${META_PREFIX}${id}`);
  const payload = await getDBItem<Uint8Array | ArrayBuffer>(`${PAYLOAD_PREFIX}${id}`);
  if (!meta || !payload) return null;

  // IndexedDB may hand back an ArrayBuffer where a Uint8Array went in,
  // depending on the driver localforage selected.
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  return { meta, payload: bytes };
}

export async function deleteGraphRecord(id: string): Promise<void> {
  return withIndexLock(async () => {
    await removeDBItem(`${PAYLOAD_PREFIX}${id}`);
    await removeDBItem(`${META_PREFIX}${id}`);
    await writeIndex((await readIndex()).filter((e) => e.id !== id));
  });
}

export interface HistoryStats {
  records: number;
  projects: number;
  payloadBytes: number;
  oldest?: string;
  newest?: string;
}

export async function getHistoryStats(): Promise<HistoryStats> {
  const index = await readIndex();
  const dates = index.map((e) => e.dataDate).filter(Boolean).sort();
  return {
    records: index.length,
    projects: new Set(index.map((e) => e.project)).size,
    payloadBytes: index.reduce((sum, e) => sum + (e.payloadBytes || 0), 0),
    oldest: dates[0],
    newest: dates[dates.length - 1],
  };
}
