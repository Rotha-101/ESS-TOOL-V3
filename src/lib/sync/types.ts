// The seam between the application and wherever graph history actually lives.
//
// Five methods, deliberately. Everything above this interface — the sync
// service, the repository tab, all of Phase 1 — is unaware of whether records
// sit on an SMB share, behind an HTTP API, or anywhere else. Swapping the
// backing store means writing one more implementation of this file's contract.

import type { GraphRecordMeta } from '@/lib/graph-codec';

/** Enough to locate a record without having read it. */
export interface RecordRef {
  id: string;
  project: string;
  dataDate: string;
  /** Present for folder transports; other transports may omit it. */
  year?: string;
}

export interface TransportStatus {
  reachable: boolean;
  /** Drives the Engineer / Management distinction. Comes from the account's
   *  role on the server, which is authoritative — a patched client cannot
   *  publish by setting this true, because the server refuses the write. */
  writable: boolean;
  schemaVersion?: number | null;
  /** Who the server says you are. Display only; never used for attribution,
   *  which the server writes itself. */
  userName?: string | null;
  role?: string | null;
  /** Human-readable and actionable; shown directly in Settings. */
  error?: string | null;
}

export type PutOutcome = { status: 'written' | 'exists'; id: string };

export interface SyncTransport {
  readonly kind: string;
  /** Reports reachability and write permission. Callers rely on this rather
   *  than a separate availability check: probe() already answers "can this
   *  transport be used right now", with a message when it cannot. */
  probe(): Promise<TransportStatus>;
  listRecordIds(): Promise<RecordRef[]>;
  fetchMeta(ref: RecordRef): Promise<GraphRecordMeta>;
  fetchPayload(ref: RecordRef): Promise<Uint8Array>;
  putRecord(meta: GraphRecordMeta, payload: Uint8Array): Promise<PutOutcome>;
}

/** Shape exposed by electron/preload.cjs.
 *
 *  Note the absence of any `getKey`: the access key can be set, cleared and
 *  tested for, but never read back into the renderer. */
export interface SyncBridge {
  identity(): Promise<{ ok: boolean; userName?: string; machineName?: string; error?: string }>;
  probe(baseUrl: string): Promise<any>;
  list(baseUrl: string): Promise<any>;
  fetchMeta(baseUrl: string, ref: RecordRef): Promise<any>;
  fetchPayload(baseUrl: string, ref: RecordRef): Promise<any>;
  put(baseUrl: string, meta: GraphRecordMeta, payload: Uint8Array): Promise<any>;
  hasKey(): Promise<{ ok: boolean; hasKey?: boolean; error?: string }>;
  setKey(key: string): Promise<{ ok: boolean; encrypted?: boolean; error?: string }>;
  clearKey(): Promise<{ ok: boolean; error?: string }>;
}

export const getSyncBridge = (): SyncBridge | null =>
  (typeof window !== 'undefined' && (window as any).syncAPI) || null;
