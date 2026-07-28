// Pull new graphs down, push locally generated ones up. That is the whole
// service.
//
// Two properties keep this small enough to reason about:
//
//   * Records are immutable, so there is no merge, no conflict resolution and
//     no last-writer-wins rule to get wrong.
//   * Phase 1 already writes every generated graph to local history first, so
//     the set of records without a `syncedAt` stamp IS the outbox. There is no
//     second queue that could drift out of step with the history.
//
// The cursor is the set of ids already held locally, never a timestamp, so
// clock differences between workstations and the server are irrelevant.
//
// A pass moves METADATA only (~1.9 KB per record). The ~0.84 MB series block is
// fetched by `ensurePayload` the first time someone opens that graph, and
// cached locally from then on. So synchronisation stays light regardless of how
// much history exists, and a graph that has been opened once stays available
// offline.

import {
  importRemoteMeta,
  listKnownIds,
  listPendingUploads,
  loadGraphRecord,
  markSynced,
  putPayload,
} from '@/lib/history-db';
import { sha256Hex, type GraphRecordMeta } from '@/lib/graph-codec';
import type { RecordRef, SyncTransport, TransportStatus } from './types';

export interface SyncResult {
  status: TransportStatus;
  downloaded: number;
  uploaded: number;
  /** Records that failed individually; the pass still counts as completed. */
  failures: string[];
  finishedAt: string;
}

const emptyResult = (status: TransportStatus): SyncResult => ({
  status,
  downloaded: 0,
  uploaded: 0,
  failures: [],
  finishedAt: new Date().toISOString(),
});

export interface SyncOptions {
  /** Progress callback for the status UI. */
  onProgress?: (message: string) => void;
  /** Cap per pass so a first run against a repository holding years of history
   *  stays responsive; the next pass picks up the remainder. Metadata-sized
   *  now that payloads are lazy — ~1.9 KB each rather than ~0.84 MB — so this
   *  can be far higher than it was without hurting a first sync. */
  maxDownloads?: number;
}

/** Hand the event loop back between records. Each download is a few
 *  milliseconds of hashing plus an IndexedDB write, but a first sync can face
 *  hundreds of them, and the window must stay responsive throughout. */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * One synchronisation pass. Never throws: an unreachable share is an ordinary
 * condition (laptop off the network), reported through the returned status so
 * the UI can show it without a crash boundary.
 */
export async function runSync(
  transport: SyncTransport,
  { onProgress, maxDownloads = 500 }: SyncOptions = {},
): Promise<SyncResult> {
  const status = await transport.probe();
  if (!status.reachable) return emptyResult(status);

  const failures: string[] = [];
  let downloaded = 0;
  let uploaded = 0;

  // ---- Pull -------------------------------------------------------------
  try {
    onProgress?.('Checking for new graphs…');
    const refs = await transport.listRecordIds();
    const known = await listKnownIds();
    const missing = refs.filter((ref) => !known.has(ref.id)).slice(0, maxDownloads);

    for (let i = 0; i < missing.length; i++) {
      const ref = missing[i];
      onProgress?.(`Receiving graph ${i + 1} of ${missing.length}…`);
      try {
        await downloadMeta(transport, ref);
        downloaded++;
      } catch (err: any) {
        // One bad record must not abandon the rest of the pass.
        failures.push(`${ref.project} ${ref.dataDate}: ${err?.message ?? String(err)}`);
      }
      await yieldToUi();
    }
  } catch (err: any) {
    failures.push(`Could not read the repository: ${err?.message ?? String(err)}`);
  }

  // ---- Push -------------------------------------------------------------
  // Read-only users (Management) skip this entirely; the server refuses the write
  // anyway, and attempting it would only produce noise in the status bar.
  if (status.writable) {
    try {
      const pending = await listPendingUploads();
      for (let i = 0; i < pending.length; i++) {
        const entry = pending[i];
        onProgress?.(`Publishing graph ${i + 1} of ${pending.length}…`);
        try {
          const record = await loadGraphRecord(entry.id);
          if (!record) {
            // Index row without a stored record — nothing to publish.
            await markSynced(entry.id);
            continue;
          }
          await transport.putRecord(record.meta, record.payload);
          await markSynced(entry.id);
          uploaded++;
        } catch (err: any) {
          failures.push(`${entry.project} ${entry.dataDate}: ${err?.message ?? String(err)}`);
        }
        await yieldToUi();
      }
    } catch (err: any) {
      failures.push(`Could not publish pending graphs: ${err?.message ?? String(err)}`);
    }
  }

  onProgress?.('');
  return { status, downloaded, uploaded, failures, finishedAt: new Date().toISOString() };
}

/** Fetch one record's METADATA and verify it before it enters local history.
 *
 * The ~0.84 MB series block is deliberately not fetched here. Metadata is
 * ~1.9 KB, so a machine that has been offline for a month catches up on
 * hundreds of graphs in a single small request instead of downloading data
 * nobody has asked to look at. The payload arrives on first open, via
 * `ensurePayload`, and is cached from then on.
 *
 * The service validates on upload, so this is defence in depth rather than the
 * only gate. Every check is cheap and every failure is per-record. */
async function downloadMeta(transport: SyncTransport, ref: RecordRef): Promise<void> {
  const meta = await transport.fetchMeta(ref);

  // Structural check. A response that parses as JSON but is not a graph record
  // would otherwise be stored and only fail much later, when someone opened it.
  // `payload.sha256` matters especially: it is the only thing that will make
  // the later payload fetch verifiable.
  if (!meta?.id || !meta.project || !meta.dataDate || !meta.payload?.sha256) {
    throw new Error('not a valid graph record (missing id, project, date or checksum)');
  }

  // The id is also the sync cursor. If the metadata claimed a different id from
  // the one it was listed under, the record would be stored under the claimed
  // id while the cursor still looked for the listed one — and it would be
  // re-downloaded on every pass, forever.
  if (meta.id !== ref.id) {
    throw new Error(`id mismatch: listed as "${ref.id}", contents say "${meta.id}"`);
  }

  await importRemoteMeta(meta);
}

/**
 * Fetch and cache the series block for a record whose metadata is already held.
 *
 * Called when someone actually opens a graph, not during sync. Verifying the
 * checksum here is what catches a truncated or interrupted transfer — no amount
 * of server-side validation can prevent that, because it happens after the
 * server is done.
 *
 * A failure caches nothing, so the next open simply tries again.
 */
export async function ensurePayload(
  transport: SyncTransport,
  meta: GraphRecordMeta,
): Promise<Uint8Array> {
  const payload = await transport.fetchPayload({
    id: meta.id,
    project: meta.project,
    dataDate: meta.dataDate,
  });

  if ((await sha256Hex(payload)) !== meta.payload.sha256) {
    throw new Error('checksum mismatch — the download may be incomplete or damaged');
  }

  await putPayload(meta.id, payload);
  return payload;
}
