// The application header.
//
// Extracted from App.tsx, where it was 47 lines of inline JSX with a hardcoded
// black background that ignored the theme — which is why light mode looked
// broken. It now uses tokens and works in both themes.
//
// Three things live here, in priority order for a user: what am I looking at
// (project), is my work safe (status), and who does the app think I am
// (identity). Status moved here from inside the Graph Repository tab, because a
// user on any other tab could not see it — which is precisely how a sync
// failure went unnoticed long enough to matter.

import React from 'react';
import { Check, CloudOff, Loader2, Moon, RefreshCw, Sun, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { decideAppState, type AppStatePolicy } from '@/lib/appState';
import { StatusPill } from '@/components/ui/status-pill';
import { HeaderClock } from '@/components/HeaderClock';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  engineer: 'Engineer',
  viewer: 'View only',
};

function statusIcon(policy: AppStatePolicy) {
  switch (policy.state) {
    case 'syncing':
      return <Loader2 className="animate-spin" />;
    case 'offline':
    case 'local_only':
      return <CloudOff />;
    case 'needs_attention':
      return <RefreshCw />;
    case 'activation_rejected':
      return <TriangleAlert />;
    default:
      return <Check />;
  }
}

export interface AppHeaderProps {
  project: string;
  projects: { id: string; label: string }[];
  onProjectChange: (id: string) => void;
}

export function AppHeader({ project, projects, onProjectChange }: AppHeaderProps) {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const syncState = useAppStore((s) => s.syncState);
  const syncEnabled = useAppStore((s) => s.syncEnabled);
  const activation = useAppStore((s) => s.activation);

  const policy = decideAppState({
    activation,
    syncEnabled,
    phase: syncState.phase,
    hasFailures: false,
  });

  const name = syncState.userName || '';
  const roleLabel = ROLE_LABEL[syncState.role ?? ''] ?? '';

  return (
    <header
      className="h-[var(--size-header)] shrink-0 border-b border-border-v bg-panel flex items-center justify-between px-4 gap-4"
      style={{ height: 'var(--size-header)' }}
    >
      {/* Identity of the product */}
      <div className="flex items-center gap-3 min-w-0">
        <img src="./SNT.png" alt="" aria-hidden="true" className="h-4 object-contain shrink-0" />
        <div className="h-4 w-px bg-border-v shrink-0" aria-hidden="true" />
        <h1 className="text-sm font-semibold tracking-tight truncate">ESS Toolbox</h1>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* What am I looking at */}
        <label className="flex items-center gap-2">
          <span className="text-xs text-foreground/50">Project</span>
          <Select value={project} onValueChange={onProjectChange}>
            <SelectTrigger
              aria-label="Active project"
              className="h-[var(--size-control-sm)] text-xs font-medium w-[150px] bg-surface border-border-v"
            >
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {/* Is my work safe — visible from every screen, not just the repository */}
        {policy.message && (
          <StatusPill tone={policy.tone === 'busy' ? 'busy' : policy.tone === 'warning' ? 'warn' : 'ok'}
            icon={statusIcon(policy)}
            size="sm"
            live
            title={policy.message}
          >
            {policy.state === 'ready'
              ? 'Saved'
              : policy.state === 'syncing'
                ? 'Syncing'
                : policy.state === 'offline'
                  ? 'Offline'
                  : policy.state === 'local_only'
                    ? 'This computer'
                    : 'Retrying'}
          </StatusPill>
        )}

        <div className="h-4 w-px bg-border-v" aria-hidden="true" />

        <HeaderClock />

        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="size-[var(--size-control-sm)] flex items-center justify-center rounded-md text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>

        {/* Who does the app think I am. Replaces the separate VIEW ONLY badge:
            the role is now always visible rather than only when restricted. */}
        {name && (
          <div className="flex items-center gap-2 pl-1" title={roleLabel ? `${name} · ${roleLabel}` : name}>
            <div
              className={cn(
                'size-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                'bg-accent-blue/15 text-accent-blue border border-accent-blue/25',
              )}
              aria-hidden="true"
            >
              {name.slice(0, 1).toUpperCase()}
            </div>
            <div className="hidden lg:flex flex-col leading-tight min-w-0">
              <span className="text-xs font-medium truncate max-w-[130px]">{name}</span>
              {roleLabel && <span className="text-xs text-foreground/45">{roleLabel}</span>}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
