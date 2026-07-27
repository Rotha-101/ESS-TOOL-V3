// Who is using this installation, decided entirely by what the shared folder
// allows. There is no role setting, no user list and no login.
//
// Deliberately dependency-free: this rule decides what an entire class of users
// sees, so it is kept pure and directly testable rather than reachable only
// through a React hook and a store.

import type { SyncState } from '@/store/useAppStore';

export interface AccessInputs {
  sharedFolderPath: string;
  syncEnabled: boolean;
  phase: SyncState['phase'];
  /** Write permission from the most recent successful probe. */
  writable: boolean;
  /** Persisted result of the last probe that reached the share. */
  lastKnownWritable: boolean;
}

/**
 * Read-only applies ONLY when the share has been positively confirmed
 * reachable but not writable. Every other state means full access:
 *
 *   no folder configured   → standalone engineer (Phase 1 behaviour)
 *   sync switched off      → engineer chose to work locally
 *   offline / not probed   → last known answer, defaulting to full access
 *
 * Erring this way matters: locking the app whenever the share is unreachable
 * would strand an engineer working off the network. Nothing is lost by being
 * permissive, because the share itself denies the write — this decides only
 * what is worth showing, never what is allowed.
 */
export function decideReadOnly({
  sharedFolderPath,
  syncEnabled,
  phase,
  writable,
  lastKnownWritable,
}: AccessInputs): boolean {
  if (!sharedFolderPath || !syncEnabled) return false;

  // 'ok' and 'error' both mean the probe reached the share, so `writable` is
  // current. 'offline', 'syncing' and 'idle' fall back to what we saw last.
  const confirmed = phase === 'ok' || phase === 'error';
  return confirmed ? !writable : !lastKnownWritable;
}
