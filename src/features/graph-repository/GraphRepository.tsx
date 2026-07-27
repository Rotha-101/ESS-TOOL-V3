// Graph Repository tab — the shared company graph history.
//
// Phase 1 is local-only and ships standalone: it already fixes the defect that
// generating today's graph destroyed yesterday's. The sync agent (Phase 3)
// fills the same list from the company repository without changing this UI.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, HardDrive, Layers, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { formatBytes } from '@/features/database/storageInspector';
import {
  deleteGraphRecord,
  getHistoryStats,
  listGraphHistory,
  type GraphHistoryEntry,
  type HistoryStats,
} from '@/lib/history-db';
import { GraphViewer } from './GraphViewer';
import { HistoryList } from './HistoryList';
import { SyncStatusBar } from './SyncStatusBar';
import { useIsReadOnly } from './useAccessMode';

export function GraphRepository({ project }: { project: string }) {
  const compactTableRows = useAppStore((s) => s.compactTableRows);
  const graphHistoryVersion = useAppStore((s) => s.graphHistoryVersion);
  const bumpGraphHistoryVersion = useAppStore((s) => s.bumpGraphHistoryVersion);

  const [entries, setEntries] = useState<GraphHistoryEntry[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<GraphHistoryEntry | null>(null);

  // This tab only reports sync; the loop is owned by useBackgroundSync in App
  // so it keeps running on every other tab too.
  const syncState = useAppStore((s) => s.syncState);
  const requestSync = useAppStore((s) => s.requestSync);
  const readOnly = useIsReadOnly();

  // Defaults to the active project because that is what the engineer is
  // working on; "All projects" is one click away for the company-wide view.
  const [projectFilter, setProjectFilter] = useState<string>(project || 'all');
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([listGraphHistory(), getHistoryStats()]);
      setEntries(list);
      setStats(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh, graphHistoryVersion]);
  useEffect(() => { setProjectFilter(project || 'all'); }, [project]);

  const projects = useMemo(
    () => [...new Set(entries.map((e) => e.project))].sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (projectFilter !== 'all' && e.project !== projectFilter) return false;
      if (!q) return true;
      return (
        e.project.toLowerCase().includes(q) ||
        e.dataDate.toLowerCase().includes(q) ||
        e.engineerName.toLowerCase().includes(q)
      );
    });
  }, [entries, projectFilter, search]);

  const handleDelete = async (entry: GraphHistoryEntry) => {
    await deleteGraphRecord(entry.id);
    setConfirm(null);
    if (openId === entry.id) setOpenId(null);
    bumpGraphHistoryVersion();
  };

  return (
    <section className="flex-1 min-h-0 bg-panel border border-border-v rounded-sm flex flex-col overflow-hidden relative">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-v flex items-center justify-between bg-surface/50 shrink-0 gap-2 flex-wrap">
        <div className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-2">
          <Archive size={14} className="text-accent-blue" />
          Graph Repository
          <span className="text-accent-blue opacity-80 pl-1 hidden sm:inline">(Company Graph History)</span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="h-7 px-2.5 text-[9px] font-bold font-mono rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          REFRESH
        </button>
      </div>

      <SyncStatusBar state={syncState} onSync={requestSync} />

      {openId ? (
        <GraphViewer id={openId} onBack={() => setOpenId(null)} />
      ) : (
        <>
          {/* Stats strip */}
          <div className="px-3 py-2 border-b border-border-v bg-background/20 flex items-center gap-4 flex-wrap shrink-0 font-mono text-[9px]">
            <span className="flex items-center gap-1.5 text-foreground/60">
              <Layers size={11} className="text-accent-blue" />
              <b className="text-foreground/90">{stats?.records ?? 0}</b> graphs
            </span>
            <span className="flex items-center gap-1.5 text-foreground/60">
              <Archive size={11} className="text-accent-blue" />
              <b className="text-foreground/90">{stats?.projects ?? 0}</b> projects
            </span>
            <span className="flex items-center gap-1.5 text-foreground/60">
              <HardDrive size={11} className="text-accent-blue" />
              <b className="text-foreground/90">{formatBytes(stats?.payloadBytes ?? 0)}</b> stored
            </span>
            {stats?.oldest && stats?.newest && (
              <span className="text-foreground/45">
                {stats.oldest} → {stats.newest}
              </span>
            )}
          </div>

          {/* Filters */}
          <div className="px-3 py-2 border-b border-border-v flex items-center gap-2 flex-wrap shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setProjectFilter('all')}
                className={cn(
                  'px-2 py-1 rounded text-[9px] font-mono font-bold border transition-colors',
                  projectFilter === 'all'
                    ? 'bg-accent-blue text-white border-accent-blue'
                    : 'bg-surface text-foreground/70 border-border-v hover:bg-foreground/5',
                )}
              >
                ALL PROJECTS
              </button>
              {projects.map((p) => (
                <button
                  key={p}
                  onClick={() => setProjectFilter(p)}
                  className={cn(
                    'px-2 py-1 rounded text-[9px] font-mono font-bold border transition-colors',
                    projectFilter === p
                      ? 'bg-accent-blue text-white border-accent-blue'
                      : 'bg-surface text-foreground/70 border-border-v hover:bg-foreground/5',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="relative ml-auto">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-foreground/30" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search date, engineer…"
                className="h-7 w-[200px] pl-7 pr-2 rounded bg-surface border border-border-v text-[9px] font-mono text-foreground/90 placeholder:text-foreground/30 focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center h-full gap-2 text-foreground/40 font-mono text-[10px]">
                <Loader2 size={16} className="animate-spin text-accent-blue" /> Reading repository…
              </div>
            ) : (
              <HistoryList
                entries={filtered}
                compact={compactTableRows}
                readOnly={readOnly}
                onOpen={setOpenId}
                onDelete={setConfirm}
              />
            )}
          </div>
        </>
      )}

      {/* Delete confirmation */}
      {confirm && (
        <div className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center p-6">
          <div className="bg-panel border border-border-v rounded shadow-xl max-w-md w-full">
            <div className="px-3 py-2 border-b border-border-v flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Delete graph</span>
              <button onClick={() => setConfirm(null)} className="text-foreground/40 hover:text-foreground">
                <X size={13} />
              </button>
            </div>
            <div className="p-4 text-[10px] font-mono text-foreground/75 leading-relaxed">
              Remove <b className="text-foreground">{confirm.project}</b> · {confirm.dataDate}
              {confirm.revision > 1 && ` (revision ${confirm.revision})`} from this computer's repository?
              <div className="mt-2 text-foreground/45">
                Only the stored graph dataset is removed. The Daily Evaluation working set is untouched.
              </div>
            </div>
            <div className="px-3 py-2 border-t border-border-v flex justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="h-7 px-3 text-[9px] font-bold font-mono rounded bg-slate-700 hover:bg-slate-600 text-white"
              >
                CANCEL
              </button>
              <button
                onClick={() => handleDelete(confirm)}
                className="h-7 px-3 text-[9px] font-bold font-mono rounded bg-red-600 hover:bg-red-500 text-white"
              >
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
