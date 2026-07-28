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
import { getDBItem } from '@/lib/db';
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
  /** Is there a dataset loaded for this project but not yet turned into a
   *  graph? Decides whether the next step is Import or Daily Evaluation. */
  const [hasWorkingData, setHasWorkingData] = useState(false);
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
        const [all, working] = await Promise.all([
          listGraphHistory(),
          getDBItem<unknown>(`eval_data_${project}`),
        ]);
        if (cancelled) return;
        setRecent(all.filter((e) => !project || e.project === project).slice(0, 5));
        setHasWorkingData(Boolean(working));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [graphHistoryVersion, project]);

  const name = syncState.userName || '';

  /**
   * The primary action follows the user's situation rather than always
   * pointing at the same screen.
   *
   *   nothing yet                → Import data
   *   data loaded, no graph yet  → Daily Evaluation
   *   previous work exists       → Continue where they left off
   *
   * A first-time user is told where to start; someone mid-task is offered the
   * thing they were doing. The other two cards stay available at lower weight,
   * so nothing is hidden — only de-emphasised.
   */
  const primaryId: 'signal' | 'soc' | 'continue' =
    recent.length > 0 ? 'continue' : hasWorkingData ? 'soc' : 'signal';

  const actions = useMemo(() => {
    const mostRecent = recent[0];
    return [
      {
        id: 'continue',
        icon: History,
        title: 'Continue previous work',
        description: mostRecent
          ? `${mostRecent.project} · ${mostRecent.dataDate}`
          : 'Pick up where you left off',
        hidden: recent.length === 0,
        onSelect: () => mostRecent && onOpenGraph(mostRecent.id),
      },
      {
        id: 'signal',
        icon: Upload,
        title: 'Import data',
        description: 'Load spreadsheets and check them',
        onSelect: () => onNavigate('signal'),
      },
      {
        id: 'soc',
        icon: Battery,
        title: 'Daily Evaluation',
        description: 'Generate the daily graph',
        onSelect: () => onNavigate('soc'),
      },
      {
        id: 'export',
        icon: Download,
        title: 'Reports & Export',
        description: 'Share results with your team',
        hidden: recent.length > 0, // keeps the row to three cards
        onSelect: () => onNavigate('export'),
      },
    ].filter((a) => !a.hidden);
  }, [recent, onNavigate, onOpenGraph]);

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
                primary={action.id === primaryId}
                onClick={action.onSelect}
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
 * A piece of past work, normalised.
 *
 * Every field the row can show is declared here rather than read ad hoc from a
 * GraphHistoryEntry, so adding real analysis types — or a source other than
 * graph history — is a change to this mapper and nothing else.
 *
 * `analysisType` is fixed today because Daily Evaluation is the only kind of
 * graph stored. It is a field, not a constant, precisely so that stops being
 * true without a redesign.
 */
export interface RecentWorkItem {
  id: string;
  project: string;
  analysisType: string;
  /** The day the data describes. */
  dataDate: string;
  /** When the work was produced. ISO. */
  lastModified: string;
  author: string;
  /** Whether it can be opened without a network round-trip. */
  saveStatus: 'on-this-computer' | 'in-the-cloud';
  /** Present when the work can be resumed rather than only viewed. Null today
   *  for every entry: a stored graph is immutable, so "continue" and "open"
   *  are the same action until editable drafts exist. */
  continueTo: string | null;
}

function toRecentWorkItem(entry: GraphHistoryEntry): RecentWorkItem {
  return {
    id: entry.id,
    project: entry.project,
    analysisType: 'Daily Evaluation',
    dataDate: entry.dataDate,
    lastModified: entry.generatedAt,
    author: entry.engineerName,
    saveStatus: entry.payloadCached === false ? 'in-the-cloud' : 'on-this-computer',
    continueTo: null,
  };
}

const SAVE_STATUS_LABEL: Record<RecentWorkItem['saveStatus'], string> = {
  'on-this-computer': 'Saved on this computer',
  'in-the-cloud': 'Opens from the cloud',
};

function RecentRow({
  entry,
  onOpen,
  onContinue,
}: {
  entry: GraphHistoryEntry;
  onOpen: () => void;
  onContinue?: (item: RecentWorkItem) => void;
}) {
  const item = toRecentWorkItem(entry);

  return (
    <li>
      <div
        className={cn(
          'group w-full flex items-center gap-3 rounded-lg px-4 py-3 transition-colors',
          'bg-surface/40 hover:bg-surface',
        )}
      >
        <div
          className="size-9 rounded-lg bg-accent-blue/10 flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <Battery className="size-4 text-accent-blue" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{item.project}</span>
            <span className="text-xs text-foreground-subtle" aria-hidden="true">·</span>
            <span className="text-sm text-foreground-muted">{item.dataDate}</span>
            <span className="text-xs text-foreground-subtle px-1.5 py-0.5 rounded bg-foreground/5">
              {item.analysisType}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-foreground-subtle mt-0.5 flex-wrap">
            <span className="truncate max-w-[180px]">{item.author}</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {relativeTime(item.lastModified)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{SAVE_STATUS_LABEL[item.saveStatus]}</span>
          </div>
        </div>

        {/* Continue is only rendered when the work can actually be resumed, so
            it never becomes a button that does the same thing as its neighbour. */}
        {item.continueTo && onContinue && (
          <button
            onClick={() => onContinue(item)}
            className="shrink-0 h-8 px-3 rounded-md text-xs font-medium bg-foreground/5 hover:bg-foreground/10 transition-colors"
          >
            Continue
          </button>
        )}

        <button
          onClick={onOpen}
          aria-label={`Open ${item.project} ${item.dataDate}`}
          className={cn(
            'shrink-0 h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1',
            'bg-foreground/5 hover:bg-accent-blue hover:text-white transition-colors',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          )}
        >
          Open <ArrowRight className="size-3" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
