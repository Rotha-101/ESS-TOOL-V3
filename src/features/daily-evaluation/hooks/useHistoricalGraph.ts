// Browsing stored graphs from inside the Daily Evaluation tab.
//
// Deliberately does NOT go through useEvalData. That hook persists to
// `eval_data_${project}` — the live working set — so loading history through it
// would overwrite whatever the engineer is working on. Worse, useGraphAutoSave
// watches the same value and would re-encode the restored dataset as a NEW
// revision of a graph that already exists, because a decoded payload has a
// different sampled signature from the parse it came from.
//
// So history is held here, beside the working set, and only swapped in at the
// point of rendering.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listGraphHistory, type GraphHistoryEntry } from '@/lib/history-db';
import { ensureGraphRecord } from '@/features/graph-repository/graphAccess';
import { restoreEvalData } from '../services/graphRecord';
import { useAppStore } from '@/store/useAppStore';
import type { GraphRecordMeta } from '@/lib/graph-codec';
import type { EvalData } from '@/types/eval-data';

export interface HistoricalGraph {
  meta: GraphRecordMeta;
  evalData: EvalData;
}

export function useHistoricalGraph(project: string) {
  const graphHistoryVersion = useAppStore((s) => s.graphHistoryVersion);

  const [entries, setEntries] = useState<GraphHistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graph, setGraph] = useState<HistoricalGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  // The index is metadata only and already local, so this is cheap enough to
  // redo whenever a sync pass lands new records.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await listGraphHistory();
      if (!cancelled) setEntries(all.filter((e) => !project || e.project === project));
    })();
    return () => { cancelled = true; };
  }, [project, graphHistoryVersion]);

  // Switching project must not leave a graph from the previous one on screen.
  useEffect(() => {
    setSelectedId(null);
    setGraph(null);
    setError('');
  }, [project]);

  useEffect(() => {
    if (!selectedId) {
      setGraph(null);
      setError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setDownloading(false);
    setError('');

    (async () => {
      try {
        const record = await ensureGraphRecord(selectedId, {
          onDownloadStart: () => { if (!cancelled) setDownloading(true); },
        });
        // ~60 ms for 2.5M samples measured — fast enough to stay off a worker.
        const evalData = restoreEvalData(record.meta, record.payload);
        if (cancelled) return;
        setGraph({ meta: record.meta, evalData });
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? String(err));
          setGraph(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setDownloading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [selectedId]);

  const selectLive = useCallback(() => setSelectedId(null), []);

  const dates = useMemo(() => new Set(entries.map((e) => e.dataDate)), [entries]);

  return {
    entries,
    dates,
    selectedId,
    setSelectedId,
    selectLive,
    graph,
    loading,
    downloading,
    error,
    /** True whenever the tab is showing history rather than the working set. */
    isHistory: selectedId !== null,
  };
}
