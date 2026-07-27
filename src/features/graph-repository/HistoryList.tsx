// The repository table: every graph this installation knows about.
//
// Renders purely from the compact index (see history-db) — no payload is read
// to draw this list, which is what keeps it instant once the repository holds
// a year of history.

import React from 'react';
import { Battery, Eye, Trash2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/features/database/storageInspector';
import type { GraphHistoryEntry } from '@/lib/history-db';

const formatWhen = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function HistoryList({
  entries,
  compact,
  readOnly,
  onOpen,
  onDelete,
}: {
  entries: GraphHistoryEntry[];
  compact: boolean;
  /** Read-only users get view and export only — no delete. */
  readOnly: boolean;
  onOpen: (id: string) => void;
  onDelete: (entry: GraphHistoryEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-foreground/35 font-mono select-none p-8 text-center">
        <Battery size={44} className="opacity-20" />
        <div className="text-[11px] font-bold uppercase tracking-widest text-foreground/45">No graphs stored yet</div>
        <div className="text-[9px] max-w-sm leading-relaxed">
          Generate a Daily Evaluation Graph and it is captured here automatically — the raw
          spreadsheets are never stored, only the final graph dataset.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-[10px] font-mono border-collapse">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="text-[9px] uppercase tracking-wider text-foreground/45 border-b border-border-v">
            <th className="text-left font-bold px-3 py-2">Project</th>
            <th className="text-left font-bold px-3 py-2">Data date</th>
            <th className="text-left font-bold px-3 py-2">Engineer</th>
            <th className="text-left font-bold px-3 py-2">Generated</th>
            <th className="text-left font-bold px-3 py-2">Plants</th>
            <th className="text-left font-bold px-3 py-2">Flags</th>
            <th className="text-right font-bold px-3 py-2">Size</th>
            <th className={cn('text-right font-bold px-3 py-2', readOnly ? 'w-[64px]' : 'w-[92px]')}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.id}
              onDoubleClick={() => onOpen(e.id)}
              className={cn(
                'border-b border-border-v/40 hover:bg-accent-blue/5 transition-colors cursor-default',
                compact ? 'h-7' : 'h-9',
              )}
            >
              <td className="px-3 font-bold text-accent-blue whitespace-nowrap">{e.project}</td>
              <td className="px-3 whitespace-nowrap">
                {e.dataDate || '—'}
                {e.revision > 1 && (
                  <span className="ml-1.5 text-[8px] font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    r{e.revision}
                  </span>
                )}
              </td>
              <td className="px-3 text-foreground/75 whitespace-nowrap max-w-[160px] truncate" title={e.engineerName}>
                {e.engineerName}
              </td>
              <td className="px-3 text-foreground/55 whitespace-nowrap">{formatWhen(e.generatedAt)}</td>
              <td className="px-3 text-foreground/70">{e.plantCount}</td>
              <td className="px-3">
                <span className="flex items-center gap-1">
                  {e.hasCycleData && (
                    <span
                      title="Cycle numbers came from real ESS cycle data"
                      className="flex items-center gap-0.5 text-[8px] font-bold px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30"
                    >
                      <Zap size={7} /> CYC
                    </span>
                  )}
                  {e.hasNcc && (
                    <span
                      title="NCC command data merged"
                      className="text-[8px] font-bold px-1 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/30"
                    >
                      NCC
                    </span>
                  )}
                </span>
              </td>
              <td className="px-3 text-right text-foreground/50 whitespace-nowrap">{formatBytes(e.payloadBytes)}</td>
              <td className="px-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onOpen(e.id)}
                    title="Open this graph"
                    className="h-5 w-5 flex items-center justify-center rounded bg-accent-blue/15 text-accent-blue hover:bg-accent-blue hover:text-white transition-colors"
                  >
                    <Eye size={11} />
                  </button>
                  {!readOnly && (
                    <button
                      onClick={() => onDelete(e)}
                      title="Delete from local repository"
                      className="h-5 w-5 flex items-center justify-center rounded bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
