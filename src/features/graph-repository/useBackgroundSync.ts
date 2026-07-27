// The one place synchronisation is scheduled.
//
// Mounted exactly once, from App, so sync runs whatever tab the user is on.
// Everything else — the Sync Now button, auto-save after generating a graph —
// asks for a pass via requestSync() in the store rather than driving its own
// loop. One owner means duplicate passes are impossible by construction.
//
// Scheduling is a chained setTimeout rather than setInterval: each pass picks
// its own next delay, so backing off while the share is unreachable needs no
// extra state. Two delays are enough —
//
//   connected    → 5 minutes
//   unreachable  → 15 minutes, because an unreachable UNC path can block for
//                  ~20 s in the OS before failing, and retrying that every
//                  5 minutes is the opposite of low resource usage
//
// A window-focus trigger closes the gap: when someone returns to the app after
// the network comes back, sync happens immediately rather than up to 15
// minutes later. navigator.onLine is deliberately NOT used — it reports
// internet connectivity, which says nothing about whether a LAN share is
// reachable.

import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { SyncState } from '@/store/useAppStore';
import { listPendingUploads } from '@/lib/history-db';
import { createTransport, runSync } from '@/lib/sync';

const INTERVAL_CONNECTED = 5 * 60 * 1000;
const INTERVAL_UNREACHABLE = 15 * 60 * 1000;
/** Ignore focus events closer together than this so alt-tabbing is free. */
const FOCUS_MIN_GAP = 60 * 1000;

/** Guards the single in-flight pass. Module scope, so it holds even if React
 *  remounts the hook (StrictMode, fast refresh). */
let passInFlight = false;
/** A request that arrived mid-pass; replayed once the pass finishes so a graph
 *  generated during a sync still publishes promptly. */
let rerunRequested = false;

export function useBackgroundSync() {
  const setSyncState = useAppStore((s) => s.setSyncState);
  const setLastKnownWritable = useAppStore((s) => s.setLastKnownWritable);
  const bumpGraphHistoryVersion = useAppStore((s) => s.bumpGraphHistoryVersion);
  const syncRequestVersion = useAppStore((s) => s.syncRequestVersion);
  const sharedFolderPath = useAppStore((s) => s.sharedFolderPath);
  const enabled = useAppStore((s) => s.sharedFolderSyncEnabled);

  // Read config at call time so editing the path in Settings takes effect on
  // the next pass without tearing down and rebuilding the timer.
  const config = useRef({ sharedFolderPath, enabled });
  config.current = { sharedFolderPath, enabled };

  const lastAttemptAt = useRef(0);

  /** One pass. Resolves to the resulting phase so the loop can pick its delay. */
  const sync = useCallback(async (): Promise<SyncState['phase']> => {
    const { sharedFolderPath: root, enabled: on } = config.current;

    if (!on) {
      setSyncState({ phase: 'idle', message: 'Shared folder sync is turned off.' });
      return 'idle';
    }
    if (!root) {
      setSyncState({ phase: 'idle', message: 'No shared folder configured yet.' });
      return 'idle';
    }
    if (passInFlight) {
      rerunRequested = true;
      return 'syncing';
    }

    passInFlight = true;
    lastAttemptAt.current = Date.now();
    setSyncState({ phase: 'syncing', message: 'Connecting…' });

    let phase: SyncState['phase'] = 'ok';
    try {
      const result = await runSync(createTransport(root), {
        onProgress: (message) => setSyncState({ message }),
      });
      const pending = (await listPendingUploads()).length;

      if (!result.status.reachable) {
        phase = 'offline';
        setSyncState({
          phase,
          writable: false,
          pending,
          message: result.status.error || 'Shared folder unavailable — working from local history.',
        });
      } else {
        // The share answered, so this is the authoritative access answer.
        // Remembered so the next launch renders the right UI immediately.
        setLastKnownWritable(result.status.writable);

        if (result.downloaded > 0 || result.uploaded > 0) bumpGraphHistoryVersion();

        const parts: string[] = [];
        if (result.downloaded) parts.push(`${result.downloaded} received`);
        if (result.uploaded) parts.push(`${result.uploaded} published`);
        if (result.failures.length) parts.push(`${result.failures.length} failed`);

        phase = result.failures.length ? 'error' : 'ok';
        setSyncState({
          phase,
          writable: result.status.writable,
          lastSyncAt: result.finishedAt,
          downloaded: result.downloaded,
          uploaded: result.uploaded,
          pending,
          message: result.failures.length
            ? result.failures[0]
            : parts.length
              ? parts.join(' · ')
              : 'Up to date.',
        });
      }
    } catch (err: any) {
      // runSync is already defensive; this only catches genuinely unexpected
      // faults, and must never take the app down with it.
      phase = 'error';
      setSyncState({ phase, message: err?.message ?? String(err) });
    } finally {
      passInFlight = false;
    }

    if (rerunRequested) {
      rerunRequested = false;
      return sync();
    }
    return phase;
  }, [setSyncState, setLastKnownWritable, bumpGraphHistoryVersion]);

  // The loop. Runs once on startup, then reschedules itself after each pass.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const phase = await sync();
      if (cancelled) return;
      const delay = phase === 'offline' || phase === 'error' ? INTERVAL_UNREACHABLE : INTERVAL_CONNECTED;
      timer = setTimeout(tick, delay);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sync]);

  // Someone asked for a pass now (Sync Now, or a graph was just generated).
  useEffect(() => {
    if (syncRequestVersion > 0) void sync();
  }, [syncRequestVersion, sync]);

  // Returning to the app is the cheapest reliable hint that the network may
  // have come back.
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastAttemptAt.current > FOCUS_MIN_GAP) void sync();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [sync]);
}
