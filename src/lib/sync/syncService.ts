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
// clock differences between workstations and the file server are irrelevant.

import {
  importRemoteRecord,
  listKnownIds,
  listPendingUploads,
  loadGraphRecord,
  markSynced,
} from '@/lib/history-db';
import { sha256Hex } from '@/lib/graph-codec';
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
   *  stays responsive; the next pass picks up the remainder. */
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
  { onProgress, maxDownloads = 50 }: SyncOptions = {},
): Promise<SyncResult> {
  const status = await transport.probe();
  if (!status.reachable) return emptyResult(status);

  const failures: string[] = [];
  let downloaded = 0;
  let uploaded = 0;

  // ---- Pull -------------------------------------------------------------
  try {
    onProgress?.('Checking shared folder…');
    const refs = await transport.listRecordIds();
    const known = await listKnownIds();
    const missing = refs.filter((ref) => !known.has(ref.id)).slice(0, maxDownloads);

    for (let i = 0; i < missing.length; i++) {
      const ref = missing[i];
      onProgress?.(`Downloading graph ${i + 1} of ${missing.length}…`);
      try {
        await downloadRecord(transport, ref);
        downloaded++;
      } catch (err: any) {
        // One bad record must not abandon the rest of the pass.
        failures.push(`${ref.project} ${ref.dataDate}: ${err?.message ?? String(err)}`);
      }
      await yieldToUi();
    }
  } catch (err: any) {
    failures.push(`Could not read the shared folder: ${err?.message ?? String(err)}`);
  }

  // ---- Push -------------------------------------------------------------
  // Read-only users (Management) skip this entirely; the share denies the write
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

/** Fetch one record and verify it before it enters local history.
 *
 * There is no server validating writes, so this is the only gate between a
 * file on a shared folder and the graph history the whole company trusts.
 * Everything it checks is cheap and every failure is per-record. */
async function downloadRecord(transport: SyncTransport, ref: RecordRef): Promise<void> {
  const meta = await transport.fetchMeta(ref);

  // Structural check before the checksum. A file that parses as JSON but is not
  // a graph record would otherwise sail past the checksum test below simply by
  // not declaring one, and only fail much later when someone opens it.
  if (!meta?.id || !meta.project || !meta.dataDate || !meta.payload?.sha256) {
    throw new Error('not a valid graph record (missing id, project, date or checksum)');
  }

  // The id is also the sync cursor. If the metadata claimed a different id from
  // the one in the filename, the record would be stored under the claimed id
  // while the cursor still looked for the filename's — and it would be
  // re-downloaded on every pass, forever.
  if (meta.id !== ref.id) {
    throw new Error(`id mismatch: file says "${ref.id}", contents say "${meta.id}"`);
  }

  const payload = await transport.fetchPayload(ref);

  // Catches a truncated SMB read before a corrupt graph is stored and then
  // presented as genuine.
  if ((await sha256Hex(payload)) !== meta.payload.sha256) {
    throw new Error('checksum mismatch — the file may be incomplete or damaged');
  }

  await importRemoteRecord({ meta, payload });
}
