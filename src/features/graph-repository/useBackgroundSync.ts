// The one place synchronisation is scheduled.
//
// Mounted exactly once, from App, so sync runs whatever tab the user is on.
// Everything else — the Sync Now button, auto-save after generating a graph —
// asks for a pass via requestSync() in the store rather than driving its own
// loop. One owner means duplicate passes are impossible by construction.
//
// Scheduling is a chained setTimeout rather than setInterval: each pass picks
// its own next delay, so backing off while the service is unreachable needs no
// extra state. Two delays are enough —
//
//   connected    → 5 minutes
//   unreachable  → 15 minutes, because a failed request can sit through DNS
//                  and TCP timeouts before giving up, and retrying that every
//                  5 minutes wastes battery and metered data for nothing
//
// Two triggers close the gap so a reconnect is not waited out:
//
//   window focus  — the user came back to the app
//   online event  — the machine regained connectivity
//
// The `online` event is only a hint (it can fire behind a captive portal), so
// it merely schedules a pass; probe() still decides. It was deliberately NOT
// used by the shared-folder transport, where internet connectivity said nothing
// about whether a LAN share was reachable — over HTTP it is exactly the right
// signal.

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
  const serverUrl = useAppStore((s) => s.serverUrl);
  const enabled = useAppStore((s) => s.syncEnabled);

  // Read config at call time so editing the path in Settings takes effect on
  // the next pass without tearing down and rebuilding the timer.
  const config = useRef({ serverUrl, enabled });
  config.current = { serverUrl, enabled };

  const lastAttemptAt = useRef(0);

  /** One pass. Resolves to the resulting phase so the loop can pick its delay. */
  const sync = useCallback(async (): Promise<SyncState['phase']> => {
    const { serverUrl: root, enabled: on } = config.current;

    if (!on) {
      setSyncState({ phase: 'idle', message: 'Synchronization is turned off.' });
      return 'idle';
    }
    if (!root) {
      setSyncState({ phase: 'idle', message: 'No server configured yet.' });
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
          message: result.status.error || 'Server unavailable — working from local history.',
        });
      } else {
        // The server answered, so this is the authoritative access answer.
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

  // Returning to the app, or the machine regaining connectivity, are both cheap
  // hints that a retry is worth attempting now rather than at the next tick.
  // Neither is treated as truth — probe() still decides.
  useEffect(() => {
    const retryIfStale = () => {
      if (Date.now() - lastAttemptAt.current > FOCUS_MIN_GAP) void sync();
    };
    const onOnline = () => void sync(); // rare, and always worth acting on
    window.addEventListener('focus', retryIfStale);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('focus', retryIfStale);
      window.removeEventListener('online', onOnline);
    };
  }, [sync]);
}
