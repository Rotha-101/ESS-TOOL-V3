// Home — the workspace, not a dashboard.
//
// Answers three questions and nothing else:
//   1. What should I do next?      → action cards
//   2. What was I working on?      → recent work
//   3. Is everything okay?         → one passive line
//
// Every element earns its place by helping someone start, continue, recover, or
// understand state. Deliberately absent: storage usage, byte counts, graph
// totals, module statistics, system information. None of those help anybody
// finish a task, and the old Dashboard was full of them.
//
// See docs/DESIGN_SYSTEM.md §8.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Battery,
  Check,
  Clock,
  CloudOff,
  Download,
  History,
  Lightbulb,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { decideAppState } from '@/lib/appState';
import { listGraphHistory, type GraphHistoryEntry } from '@/lib/history-db';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';

/** Relative time in words. "2 days ago" is what someone actually wants to know;
 *  an ISO timestamp is not. */
function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 90) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 172800) return seconds < 86400 ? `${Math.floor(seconds / 3600)} hours ago` : 'yesterday';
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)} days ago`;
  return new Date(iso).toLocaleDateString();
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const TIP_DISMISSED_KEY = 'ess-home-tip-dismissed';

export interface HomeWorkspaceProps {
  project: string;
  onNavigate: (tab: string) => void;
  onOpenGraph: (id: string) => void;
}

export function HomeWorkspace({ project, onNavigate, onOpenGraph }: HomeWorkspaceProps) {
  const syncState = useAppStore((s) => s.syncState);
  const syncEnabled = useAppStore((s) => s.syncEnabled);
  const activation = useAppStore((s) => s.activation);
  const graphHistoryVersion = useAppStore((s) => s.graphHistoryVersion);

  const [recent, setRecent] = useState<GraphHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipDismissed, setTipDismissed] = useState(
    () => localStorage.getItem(TIP_DISMISSED_KEY) === '1',
  );

  const policy = decideAppState({
    activation,
    syncEnabled,
    phase: syncState.phase,
    hasFailures: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await listGraphHistory();
        if (!cancelled) setRecent(all.slice(0, 5));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [graphHistoryVersion]);

  const name = syncState.userName || '';

  const actions = useMemo(
    () => [
      {
        id: 'signal',
        icon: Upload,
        title: 'Import data',
        description: 'Load spreadsheets and check them',
      },
      {
        id: 'soc',
        icon: Battery,
        title: 'Daily Evaluation',
        description: 'Generate the daily graph',
        primary: true,
      },
      {
        id: 'export',
        icon: Download,
        title: 'Reports & Export',
        description: 'Share results with your team',
      },
    ],
    [],
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-10 space-y-10">
        {/* Greeting + the one status line. Passive: if nothing is required of
            the user, this must not look like something is wrong. */}
        <header className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {greeting()}{name ? `, ${name}` : ''}
            </h1>
            <p className="text-sm text-foreground/50 mt-1">
              {project ? `Working on ${project}` : 'Choose a project to begin'}
            </p>
          </div>
          <StatusPill
            tone={policy.tone === 'busy' ? 'busy' : policy.tone === 'warning' ? 'warn' : 'ok'}
            icon={
              policy.state === 'syncing' ? <Loader2 className="animate-spin" />
                : policy.state === 'offline' || policy.state === 'local_only' ? <CloudOff />
                  : <Check />
            }
            live
          >
            {policy.message}
          </StatusPill>
        </header>

        {/* What should I do next. The primary action dominates. */}
        <section aria-labelledby="home-actions">
          <h2 id="home-actions" className="sr-only">Start work</h2>
          {/* --breakpoint-lg is 1600px in this design system, not Tailwind's
              1024px, so `sm` is the right step for a 1200px window. */}
          <div className="grid gap-4 sm:grid-cols-3">
            {actions.map((action) => (
              <ActionCard
                key={action.id}
                icon={action.icon}
                title={action.title}
                description={action.description}
                primary={action.primary}
                onClick={() => onNavigate(action.id)}
              />
            ))}
          </div>
        </section>

        {/* What was I working on. */}
        <section aria-labelledby="home-recent" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="home-recent" className="text-sm font-semibold text-foreground/80">
              Recent work
            </h2>
            {recent.length > 0 && (
              <button
                onClick={() => onNavigate('graph_repository')}
                className="text-xs text-foreground/50 hover:text-foreground transition-colors flex items-center gap-1"
              >
                View all <ArrowRight className="size-3" />
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading recent work">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-surface/40 animate-pulse" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="rounded-lg bg-surface/30">
              <EmptyState
                icon={<History />}
                title="Your graphs will appear here"
                description="Every graph you generate is saved automatically, so you can come back to any day without importing again."
                action={
                  <button
                    onClick={() => onNavigate('signal')}
                    className="h-[var(--size-control-md)] px-4 rounded-lg bg-accent-blue text-white text-sm font-medium hover:bg-blue-600 transition-colors"
                  >
                    Import data to get started
                  </button>
                }
              />
            </div>
          ) : (
            <ul className="space-y-1.5">
              {recent.map((entry) => (
                <RecentRow key={entry.id} entry={entry} onOpen={() => onOpenGraph(entry.id)} />
              ))}
            </ul>
          )}
        </section>

        {/* Dismissible, and stays dismissed. */}
        {!tipDismissed && recent.length > 0 && (
          <aside className="flex items-start gap-3 rounded-lg bg-accent-blue/5 p-4">
            <Lightbulb className="size-4 text-accent-blue shrink-0 mt-0.5" aria-hidden="true" />
            <p className="flex-1 text-xs text-foreground/60 leading-relaxed">
              You can open any past day from the date picker in Daily Evaluation — there is no
              need to import the same files twice.
            </p>
            <button
              onClick={() => {
                localStorage.setItem(TIP_DISMISSED_KEY, '1');
                setTipDismissed(true);
              }}
              aria-label="Dismiss tip"
              className="text-foreground/30 hover:text-foreground/70 transition-colors shrink-0"
            >
              <X className="size-3.5" />
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}

/** Primary actions dominate; the rest sit back. Spacing and type carry the
 *  hierarchy rather than borders. */
function ActionCard({
  icon: Icon,
  title,
  description,
  primary,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group text-left rounded-xl p-5 transition-all',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        primary
          ? 'bg-accent-blue text-white shadow-[var(--shadow-elevation-2)] hover:brightness-110'
          : 'bg-surface/50 hover:bg-surface text-foreground',
      )}
    >
      <Icon
        className={cn('size-5 mb-3', primary ? 'text-white' : 'text-accent-blue')}
        aria-hidden="true"
      />
      <div className={cn('text-base font-semibold', primary ? 'text-white' : 'text-foreground')}>
        {title}
      </div>
      <div className={cn('text-xs mt-1 leading-relaxed', primary ? 'text-white/75' : 'text-foreground/50')}>
        {description}
      </div>
    </button>
  );
}

/**
 * One past graph.
 *
 * Shows project, date, who made it, when, and whether it is on this computer.
 * Analysis type is a fixed label today because Daily Evaluation is the only
 * kind of graph stored — the row is laid out so adding it later is a field,
 * not a redesign.
 */
function RecentRow({ entry, onOpen }: { entry: GraphHistoryEntry; onOpen: () => void }) {
  const cached = entry.payloadCached !== false;
  return (
    <li>
      <button
        onClick={onOpen}
        className={cn(
          'w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors',
          'bg-surface/40 hover:bg-surface',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        <div
          className="size-9 rounded-lg bg-accent-blue/10 flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <Battery className="size-4 text-accent-blue" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{entry.project}</span>
            <span className="text-xs text-foreground/40">·</span>
            <span className="text-sm text-foreground/70">{entry.dataDate}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-foreground/45 mt-0.5">
            <span className="truncate max-w-[180px]">{entry.engineerName}</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {relativeTime(entry.generatedAt)}
            </span>
          </div>
        </div>

        {/* Sync state, stated plainly. Not an icon a user has to decode. */}
        <span className="text-xs text-foreground/40 shrink-0 hidden sm:block">
          {cached ? 'On this computer' : 'Opens from the cloud'}
        </span>

        <ArrowRight className="size-4 text-foreground/25 group-hover:text-foreground/50 shrink-0" aria-hidden="true" />
      </button>
    </li>
  );
}
