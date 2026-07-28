// Date picker for browsing stored Daily Evaluation Graphs.
//
// Reads the LOCAL index only — which is the whole point of syncing metadata
// eagerly and payloads lazily. Every graph the company has ever published is
// already listed here, on every machine, for ~1.9 KB each; opening one is what
// triggers a download.
//
// Dates are handled as plain YYYY-MM-DD strings throughout. `dataDate` is
// plant-local and must never be round-tripped through a UTC Date, or a graph
// plotted late on the 27th shows up under the 28th for half the company.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Cloud, HardDrive, Radio, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GraphHistoryEntry } from '@/lib/history-db';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Local noon: far enough from either midnight that adding days never lands on
 *  a DST transition and silently loses one. */
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);
const toYmd = (date: Date) => ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());

const shiftDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = at(y, m, d);
  date.setDate(date.getDate() + days);
  return toYmd(date);
};

const todayYmd = () => toYmd(new Date());

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface Range {
  from: string;
  to: string;
  label: string;
}

export interface DateSelectorProps {
  /** Local index rows for the active project, newest first. */
  entries: GraphHistoryEntry[];
  /** Record currently being displayed, or null when showing the live working set. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Return to the freshly generated / imported working set. */
  onSelectLive: () => void;
  /** Data date of the live working set, if there is one. */
  liveDate?: string | null;
  hasLive: boolean;
}

export function DateSelector({
  entries,
  selectedId,
  onSelect,
  onSelectLive,
  liveDate,
  hasLive,
}: DateSelectorProps) {
  const [open, setOpen] = useState(false);
  const [pendingDay, setPendingDay] = useState<string | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  // The month on screen follows whatever is being shown, so opening the picker
  // lands on the relevant month rather than always on today.
  const anchor = selected?.dataDate || liveDate || todayYmd();
  const [view, setView] = useState(() => {
    const [y, m] = anchor.split('-').map(Number);
    return { y, m };
  });

  useEffect(() => {
    if (!open) return;
    const [y, m] = anchor.split('-').map(Number);
    setView({ y, m });
    setPendingDay(null);
    setRange(null);
  }, [open, anchor]);

  // Close on outside click / Escape. Without this the panel survives clicking
  // straight into the graph, which reads as the app being stuck.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const byDate = useMemo(() => {
    const map = new Map<string, GraphHistoryEntry[]>();
    for (const e of entries) {
      const list = map.get(e.dataDate);
      if (list) list.push(e);
      else map.set(e.dataDate, [e]);
    }
    return map;
  }, [entries]);

  /** Records the panel is currently offering: a chosen day, or a quick range. */
  const offered = useMemo<GraphHistoryEntry[]>(() => {
    if (pendingDay) return byDate.get(pendingDay) ?? [];
    if (range) {
      return entries
        .filter((e) => e.dataDate >= range.from && e.dataDate <= range.to)
        .sort((a, b) => (a.dataDate < b.dataDate ? 1 : a.dataDate > b.dataDate ? -1 : 0));
    }
    return [];
  }, [pendingDay, range, byDate, entries]);

  const grid = useMemo(() => {
    const first = at(view.y, view.m, 1);
    const lead = first.getDay();
    const days = new Date(view.y, view.m, 0).getDate();
    const cells: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= days; d++) cells.push(ymd(view.y, view.m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  const stepMonth = (delta: number) => {
    setView(({ y, m }) => {
      const next = m + delta;
      if (next < 1) return { y: y - 1, m: 12 };
      if (next > 12) return { y: y + 1, m: 1 };
      return { y, m: next };
    });
  };

  const chooseDay = (day: string) => {
    setRange(null);
    const records = byDate.get(day) ?? [];
    // One graph is the overwhelmingly common case — open it without making the
    // user confirm a list of one.
    if (records.length === 1) {
      onSelect(records[0].id);
      setOpen(false);
      setPendingDay(null);
      return;
    }
    setPendingDay(day);
  };

  const applyRange = (label: string, from: string, to: string) => {
    setPendingDay(null);
    setRange({ label, from, to });
  };

  const today = todayYmd();
  const thisMonthStart = today.slice(0, 8) + '01';
  const lastMonthEnd = shiftDays(thisMonthStart, -1);

  const label = selected
    ? selected.dataDate
    : hasLive && liveDate
      ? liveDate
      : 'Select date';

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Browse stored graphs by date"
        className={cn(
          'h-7 px-2.5 rounded border flex items-center gap-1.5 text-[10px] font-mono font-bold transition-colors',
          selected
            ? 'bg-amber-500/15 text-amber-400 border-amber-500/40 hover:bg-amber-500/25'
            : 'bg-surface text-foreground/80 border-border-v hover:bg-foreground/5',
        )}
      >
        <Calendar size={11} className={selected ? 'text-amber-400' : 'text-accent-blue'} />
        <span>{label}</span>
        {selected && <span className="text-[8px] opacity-70 uppercase">history</span>}
        <ChevronDown size={11} className="opacity-50" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-[268px] rounded border border-border-v bg-panel shadow-xl">
          {/* Month navigation */}
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border-v">
            <button
              onClick={() => stepMonth(-1)}
              className="h-6 w-6 rounded hover:bg-foreground/10 flex items-center justify-center text-foreground/60"
              title="Previous month"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[10px] font-mono font-bold">{MONTHS[view.m - 1]} {view.y}</span>
            <button
              onClick={() => stepMonth(1)}
              className="h-6 w-6 rounded hover:bg-foreground/10 flex items-center justify-center text-foreground/60"
              title="Next month"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Calendar grid */}
          <div className="p-2">
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {DOW.map((d) => (
                <div key={d} className="text-[8px] font-mono text-foreground/35 text-center py-0.5">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((day, i) => {
                if (!day) return <div key={`pad-${i}`} />;
                const count = byDate.get(day)?.length ?? 0;
                const isSelected = selected?.dataDate === day || pendingDay === day;
                const isToday = day === today;
                return (
                  <button
                    key={day}
                    onClick={() => chooseDay(day)}
                    title={count === 0 ? 'No graph for this date' : `${count} graph${count > 1 ? 's' : ''}`}
                    className={cn(
                      'relative h-7 rounded text-[10px] font-mono transition-colors flex items-center justify-center',
                      isSelected
                        ? 'bg-accent-blue text-white font-bold'
                        : count > 0
                          ? 'text-foreground/90 font-bold hover:bg-accent-blue/20'
                          : 'text-foreground/25 hover:bg-foreground/5',
                      isToday && !isSelected && 'ring-1 ring-accent-blue/40',
                    )}
                  >
                    {Number(day.slice(8))}
                    {count > 0 && !isSelected && (
                      <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-accent-blue" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick ranges */}
          <div className="px-2 pb-2 grid grid-cols-3 gap-1">
            {[
              { label: 'Today', run: () => chooseDay(today) },
              { label: 'Yesterday', run: () => chooseDay(shiftDays(today, -1)) },
              { label: 'Last 7 Days', run: () => applyRange('Last 7 days', shiftDays(today, -6), today) },
              { label: 'Last 30 Days', run: () => applyRange('Last 30 days', shiftDays(today, -29), today) },
              { label: 'This Month', run: () => applyRange('This month', thisMonthStart, today) },
              { label: 'Last Month', run: () => applyRange('Last month', lastMonthEnd.slice(0, 8) + '01', lastMonthEnd) },
            ].map((q) => (
              <button
                key={q.label}
                onClick={q.run}
                className="h-6 rounded border border-border-v bg-surface text-[8px] font-mono font-bold text-foreground/70 hover:bg-accent-blue hover:text-white hover:border-accent-blue transition-colors"
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Native date entry, for typing a date far from the current month */}
          <div className="px-2 pb-2">
            <input
              type="date"
              value={pendingDay ?? selected?.dataDate ?? ''}
              onChange={(e) => { if (e.target.value) chooseDay(e.target.value); }}
              className="w-full h-7 px-2 rounded bg-surface border border-border-v text-[10px] font-mono text-foreground/90 focus:outline-none focus:border-accent-blue"
            />
          </div>

          {/* Results for the chosen day or range */}
          {(pendingDay || range) && (
            <div className="border-t border-border-v max-h-[188px] overflow-y-auto">
              {offered.length === 0 ? (
                <div className="px-3 py-3 text-[9px] font-mono text-foreground/50 text-center leading-relaxed">
                  No graph available for the selected date.
                  <div className="text-foreground/30 mt-1">
                    {pendingDay ?? range?.label} · {entries.length} stored for this project
                  </div>
                </div>
              ) : (
                <>
                  <div className="px-2 pt-1.5 pb-1 text-[8px] font-mono uppercase tracking-wider text-foreground/40">
                    {offered.length} graph{offered.length > 1 ? 's' : ''} · {pendingDay ?? range?.label}
                  </div>
                  {offered.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => { onSelect(e.id); setOpen(false); }}
                      className={cn(
                        'w-full px-2 py-1.5 text-left hover:bg-accent-blue/10 border-t border-border-v/50 flex items-center gap-2',
                        e.id === selectedId && 'bg-accent-blue/15',
                      )}
                    >
                      <span className="text-[10px] font-mono font-bold text-foreground/90 shrink-0">{e.dataDate}</span>
                      {e.revision > 1 && (
                        <span className="text-[8px] font-mono px-1 rounded bg-amber-500/15 text-amber-400 shrink-0">
                          rev {e.revision}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[8px] font-mono text-foreground/50 truncate">
                        <User size={8} /> {e.engineerName}
                      </span>
                      <span
                        className="ml-auto shrink-0"
                        title={e.payloadCached !== false ? 'Stored on this computer' : 'Downloads when opened'}
                      >
                        {e.payloadCached !== false
                          ? <HardDrive size={9} className="text-emerald-400/70" />
                          : <Cloud size={9} className="text-blue-400/70" />}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Back to the live working set */}
          {hasLive && selected && (
            <button
              onClick={() => { onSelectLive(); setOpen(false); }}
              className="w-full px-2 py-1.5 border-t border-border-v text-[9px] font-mono font-bold text-emerald-400 hover:bg-emerald-500/10 flex items-center justify-center gap-1.5"
            >
              <Radio size={10} /> BACK TO CURRENT GRAPH{liveDate ? ` (${liveDate})` : ''}
            </button>
          )}

          <div className="px-2 py-1.5 border-t border-border-v text-[8px] font-mono text-foreground/30 text-center">
            Graphs sync automatically. Data downloads when opened.
          </div>
        </div>
      )}
    </div>
  );
}
