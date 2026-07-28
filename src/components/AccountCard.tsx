// Who you are, as far as the service is concerned.
//
// Everything here is read-only by design. Identity is server-owned: the name
// on a published graph comes from the activation credential, not from a field
// on this screen, so an editable "Engineer Name" was always decorative — and
// worse, it implied a control the user did not have.
//
// What used to live here — Server URL, Access Key, Test Connection — is gone
// from the user experience entirely. An administrator can still reach the
// endpoint override; a normal user has nothing to configure.

import React from 'react';
import { Cloud, CloudOff, Loader2, LogOut, Monitor, ShieldCheck, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { decideAppState } from '@/lib/appState';
import { useActivation } from '@/features/activation';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  engineer: 'Engineer',
  viewer: 'View only',
  unknown: '',
};

export function AccountCard() {
  const syncState = useAppStore((s) => s.syncState);
  const syncEnabled = useAppStore((s) => s.syncEnabled);
  const setSyncEnabled = useAppStore((s) => s.setSyncEnabled);
  const activation = useAppStore((s) => s.activation);
  const { deviceLabel, signOut } = useActivation();

  const policy = decideAppState({
    activation,
    syncEnabled,
    phase: syncState.phase,
    hasFailures: false,
  });

  const roleLabel = ROLE_LABEL[syncState.role ?? 'unknown'] ?? '';
  const displayName = syncState.userName || '';

  return (
    <div className="space-y-4">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
        <User size={12} /> Your account
      </h3>

      <div className="bg-surface/50 p-4 rounded-lg border border-border-v space-y-3">
        {displayName ? (
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-accent-blue/15 border border-accent-blue/25 flex items-center justify-center shrink-0">
              <span className="text-[12px] font-semibold text-accent-blue">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-foreground truncate">{displayName}</div>
              {roleLabel && (
                <div className="flex items-center gap-1 text-[11px] text-foreground/50">
                  <ShieldCheck size={10} /> {roleLabel}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-[12px] text-foreground/50">
            Not connected to your company account.
          </div>
        )}

        {deviceLabel && (
          <div className="flex items-center gap-2 pt-1 text-[11px] text-foreground/45">
            <Monitor size={11} /> {deviceLabel}
          </div>
        )}

        {/* Status, in one plain sentence. No phase names, no counters. */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] border',
            policy.tone === 'warning'
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
              : policy.tone === 'busy'
                ? 'bg-accent-blue/10 border-accent-blue/25 text-accent-blue'
                : 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400',
          )}
        >
          {policy.tone === 'busy' ? (
            <Loader2 size={13} className="animate-spin shrink-0" />
          ) : policy.state === 'offline' || policy.state === 'local_only' ? (
            <CloudOff size={13} className="shrink-0" />
          ) : (
            <Cloud size={13} className="shrink-0" />
          )}
          <span className="leading-relaxed">{policy.message}</span>
        </div>
      </div>

      {/* The one control a normal user has, and it is genuinely useful: work
          entirely on this computer. */}
      <div className="flex items-center justify-between bg-surface/50 p-3.5 rounded-lg border border-border-v">
        <div className="flex flex-col pr-4">
          <span className="text-[12px] font-medium">Keep my work in sync</span>
          <span className="text-[11px] text-foreground/45 leading-relaxed">
            Share graphs with your team automatically
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={syncEnabled}
            onChange={(e) => setSyncEnabled(e.target.checked)}
          />
          <div className="w-9 h-5 bg-foreground/20 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-checked:bg-accent-blue" />
        </label>
      </div>

      <button
        onClick={signOut}
        className="w-full h-9 rounded-lg border border-border-v bg-surface/50 text-[12px] text-foreground/70 hover:text-red-400 hover:border-red-500/30 transition-colors flex items-center justify-center gap-2"
      >
        <LogOut size={13} /> Sign out of this computer
      </button>
    </div>
  );
}
