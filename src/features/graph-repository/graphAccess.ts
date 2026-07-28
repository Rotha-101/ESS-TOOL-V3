// Getting a complete graph, wherever it happens to live.
//
// Sync stores metadata only, so a record can be listed and dated long before
// its series block exists on this computer. Everything that opens a graph goes
// through here, and the resolution order is always the same:
//
//   1. local payload      → offline, instant, the common case after first open
//   2. cloud payload      → fetched once, verified, then cached locally
//   3. neither            → an error worded so the user knows which it was
//
// Step 2 is why an engineer can open a colleague's graph from three months ago
// without anyone having downloaded three months of data in advance.

import { loadGraphMeta, loadGraphRecord } from '@/lib/history-db';
import { createTransport, ensurePayload } from '@/lib/sync';
import { useAppStore } from '@/store/useAppStore';
import type { GraphRecord } from '@/lib/graph-codec';

/** Thrown when a graph exists in the index but its data is neither cached nor
 *  reachable. Distinguished so the UI can say "you are offline" rather than
 *  "this graph is broken". */
export class PayloadUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadUnavailableError';
  }
}

export interface EnsureOptions {
  /** Told when a network fetch actually starts, so the caller can show
   *  "Downloading…" only when there is something to wait for. */
  onDownloadStart?: () => void;
}

/**
 * Resolve a record id to a complete { meta, payload }.
 *
 * Never partially caches: `ensurePayload` verifies the checksum before storing,
 * so a failed download leaves local state exactly as it was and the next
 * attempt simply tries again.
 */
export async function ensureGraphRecord(
  id: string,
  { onDownloadStart }: EnsureOptions = {},
): Promise<GraphRecord> {
  // 1. Already complete locally?
  const local = await loadGraphRecord(id);
  if (local) return local;

  // 2. Metadata without payload — the normal state for a synced graph nobody
  //    on this machine has opened yet.
  const meta = await loadGraphMeta(id);
  if (!meta) {
    throw new PayloadUnavailableError('This graph is not in the local repository.');
  }

  const { serverUrl, syncEnabled } = useAppStore.getState();
  if (!serverUrl || !syncEnabled) {
    throw new PayloadUnavailableError(
      'This graph has not been downloaded to this computer yet, and synchronization is turned off. Turn it on in Settings to fetch it.',
    );
  }

  onDownloadStart?.();

  try {
    const payload = await ensurePayload(createTransport(serverUrl), meta);
    return { meta, payload };
  } catch (err: any) {
    throw new PayloadUnavailableError(
      `This graph has not been downloaded to this computer yet, and the server could not be reached: ${err?.message ?? String(err)}`,
    );
  }
}
