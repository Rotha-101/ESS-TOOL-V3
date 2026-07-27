// SyncTransport backed by a Windows shared folder, reached through the
// Electron main process (see electron/sync/repository.cjs).
//
// The renderer holds no filesystem handles; it passes the configured root path
// on every call, which keeps the main process stateless and means changing the
// path in Settings takes effect immediately with nothing to invalidate.

import type {
  PutOutcome,
  RecordRef,
  SyncTransport,
  TransportStatus,
} from './types';
import { getSyncBridge } from './types';
import type { GraphRecordMeta } from '@/lib/graph-codec';

/** Main-process handlers resolve `{ ok: false, error }` rather than throwing,
 *  so unwrap once here instead of at every call site. */
function unwrap<T>(response: any, context: string): T {
  if (!response) throw new Error(`${context}: no response from the application host.`);
  if (response.ok === false) throw new Error(response.error || `${context} failed.`);
  return response as T;
}

export class FolderTransport implements SyncTransport {
  readonly kind = 'shared-folder';

  constructor(private readonly rootPath: string) {}

  private bridge() {
    const bridge = getSyncBridge();
    if (!bridge) {
      // Browser/dev-server context. Not an error worth a stack trace — the UI
      // reports it as "desktop application required".
      throw new Error('Shared folder sync is only available in the desktop application.');
    }
    return bridge;
  }

  async probe(): Promise<TransportStatus> {
    if (!this.rootPath) {
      return { reachable: false, writable: false, error: 'No shared folder configured.' };
    }
    if (!getSyncBridge()) {
      return { reachable: false, writable: false, error: 'Shared folder sync is only available in the desktop application.' };
    }
    const res = await this.bridge().probe(this.rootPath);
    if (res?.ok === false) return { reachable: false, writable: false, error: res.error };
    return {
      reachable: Boolean(res.reachable),
      writable: Boolean(res.writable),
      schemaVersion: res.schemaVersion ?? null,
      error: res.error ?? null,
    };
  }

  async listRecordIds(): Promise<RecordRef[]> {
    const res = unwrap<{ refs: RecordRef[] }>(await this.bridge().list(this.rootPath), 'Listing the repository');
    return res.refs ?? [];
  }

  async fetchMeta(ref: RecordRef): Promise<GraphRecordMeta> {
    const res = unwrap<{ meta: GraphRecordMeta }>(
      await this.bridge().fetchMeta(this.rootPath, ref),
      `Reading record ${ref.id}`,
    );
    return res.meta;
  }

  async fetchPayload(ref: RecordRef): Promise<Uint8Array> {
    const res = unwrap<{ payload: Uint8Array | ArrayBuffer }>(
      await this.bridge().fetchPayload(this.rootPath, ref),
      `Downloading graph ${ref.id}`,
    );
    const payload = res.payload;
    return payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  }

  async putRecord(meta: GraphRecordMeta, payload: Uint8Array): Promise<PutOutcome> {
    const res = unwrap<PutOutcome>(
      await this.bridge().put(this.rootPath, meta, payload),
      `Publishing graph ${meta.id}`,
    );
    return { status: res.status ?? 'written', id: res.id ?? meta.id };
  }
}
