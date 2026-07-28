// Sync status for the Graph Repository header.
//
// States are worded so a user knows whether to act: "offline" explicitly says
// local history still works, because the app being usable without the server is
// the point, not a degraded mode to apologise for.

import React from 'react';
import { AlertTriangle, CloudOff, Eye, Loader2, Pencil, RefreshCw, Settings2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import type { SyncState } from '@/store/useAppStore';

const relativeTime = (iso: string | null): string => {
  if (!iso) return '';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

/** Three things a user needs: saved, working on it, or not connected. Every
 *  other distinction the sync engine makes is internal. */
function badgeFor(state: SyncState, configured: boolean) {
  if (!configured) {
    return {
      icon: <CloudOff size={11} />,
      label: 'This computer only',
      tone: 'text-foreground/50 border-foreground/15 bg-foreground/5',
    };
  }
  switch (state.phase) {
    case 'syncing':
      return { icon: <Loader2 size={11} className="animate-spin" />, label: 'Syncing', tone: 'text-accent-blue border-accent-blue/30 bg-accent-blue/10' };
    case 'ok':
      return { icon: <Check size={11} />, label: 'Saved', tone: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
    case 'offline':
      return { icon: <CloudOff size={11} />, label: 'Offline', tone: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
    case 'error':
      // Not "sync issue" — the retry is automatic, so the user has nothing to
      // do and should not be alarmed into trying.
      return { icon: <AlertTriangle size={11} />, label: 'Retrying', tone: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
    default:
      return { icon: <Check size={11} />, label: 'Saved', tone: 'text-foreground/50 border-foreground/15 bg-foreground/5' };
  }
}

export function SyncStatusBar({ state, onSync }: { state: SyncState; onSync: () => void }) {
  const setIsSettingsOpen = useAppStore((s) => s.setIsSettingsOpen);

  // "Configured" is now "activated". The endpoint ships with the build, so
  // there is nothing for a user to set up — only an account to connect.
  const configured = useAppStore((s) => s.activation === 'active');
  const badge = badgeFor(state, configured);
  const busy = state.phase === 'syncing';

  return (
    <div className="px-3 py-1.5 border-b border-border-v bg-background/20 flex items-center gap-2 flex-wrap shrink-0 font-mono text-[9px]">
      <span className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded border font-bold', badge.tone)}>
        {badge.icon} {badge.label}
      </span>

      {/* Only when the server actually answered. `writable` is forced false
          while offline, so showing this on any non-idle phase told an engineer
          they were "View only" the moment their network dropped — when in fact
          they keep full access. Same `confirmed` rule decideReadOnly uses. */}
      {configured && (state.phase === 'ok' || state.phase === 'error') && (
        <span
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded border font-bold',
            state.writable
              ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/5'
              : 'text-blue-400 border-blue-500/25 bg-blue-500/5',
          )}
          title={state.writable ? 'You can publish graphs to the company repository' : 'Read-only access to the company repository'}
        >
          {state.writable ? <><Pencil size={9} /> Can publish</> : <><Eye size={9} /> View only</>}
        </span>
      )}

      {state.pending > 0 && (
        <span className="px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 font-bold">
          {state.pending} waiting to publish
        </span>
      )}

      {state.message && (
        <span className={cn('truncate max-w-[420px]', state.phase === 'error' ? 'text-red-400' : 'text-foreground/50')} title={state.message}>
          {state.message}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {state.lastSyncAt && <span className="text-foreground/30">Updated {relativeTime(state.lastSyncAt)}</span>}
        {configured ? (
          // Refresh, not "Sync Now". Synchronisation is automatic — on a timer,
          // on window focus, on regaining connectivity, and the moment a graph
          // is generated. A button labelled "Sync Now" implied the user was
          // responsible for something they never were.
          <button
            onClick={onSync}
            disabled={busy}
            title="Check for new graphs now. This also happens automatically."
            className="h-6 px-2 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center gap-1 disabled:opacity-50"
          >
            {busy ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} REFRESH
          </button>
        ) : (
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="h-6 px-2 rounded bg-accent-blue hover:bg-blue-600 text-white font-bold flex items-center gap-1"
          >
            <Settings2 size={10} /> CONNECT ACCOUNT
          </button>
        )}
      </div>
    </div>
  );
}
