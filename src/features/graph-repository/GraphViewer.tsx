// Renders a stored graph by restoring it and handing it to the SAME
// GraphPanels the Daily Evaluation tab uses.
//
// Nothing about the drawing is reimplemented here. That is the whole point:
// htmlExportSingle/htmlExportAll already show what happens when render logic
// gets duplicated (see docs/template-drift.diff — ~150 lines of unintended
// divergence). A stored graph therefore looks exactly like the original, and
// any future fix to the panels applies retroactively to all history.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Calendar, Copy, Cpu, Download, Loader2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { getProjectPlants } from '@/lib/project-utils';
import { is20PercentProject } from '@/lib/project-detection';
import { loadGraphRecord } from '@/lib/history-db';
import { formatBytes } from '@/features/database/storageInspector';
import { GraphPanels } from '@/features/daily-evaluation/components/GraphPanels';
import { usePinnedPoints } from '@/features/daily-evaluation/hooks/usePinnedPoints';
import { restoreEvalData } from '@/features/daily-evaluation/services/graphRecord';
import { copyChartsToClipboard } from '@/features/daily-evaluation/services/clipboardExport';
import { exportSingleGraphHtml } from '@/features/daily-evaluation/services/htmlExportSingle';
import type { GraphRecordMeta } from '@/lib/graph-codec';
import type { EvalData, PlantKey } from '@/types/eval-data';
import type { ActiveMetric } from '@/types/graph';

/** Same labels the Daily Evaluation tab's figure list uses. */
function metricLabel(metric: ActiveMetric, project: string): string {
  const plants = getProjectPlants(project);
  switch (metric) {
    case 'pf_p1': return 'Figure 1: SWG01 Powerflow Check';
    case 'pf_p2': return 'Figure 2: SWG02 Powerflow Check';
    case 'pf_p3': return 'Figure 3: SWG03 Powerflow Check';
    case 'fig4': return is20PercentProject(project) ? 'Figure 1: Daily Evaluation' : 'Figure 4: Powerflow Check';
    case 'fig5': return `Figure ${plants.length + 1}: Active Power & SOC`;
    case 'fig6': return `Figure ${plants.length + 2}: Volt & Reactive Power`;
    case 'f_p': return 'Figure 1: Frequency & Active Power';
    case 'soc_p': return 'Figure 2: SOC & Active Power';
    case 'v_q': return 'Figure 3: Voltage & Reactive Power';
    default: return metric;
  }
}

export function GraphViewer({ id, onBack }: { id: string; onBack: () => void }) {
  const theme = useAppStore((s) => s.theme);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const [meta, setMeta] = useState<GraphRecordMeta | null>(null);
  const [evalData, setEvalData] = useState<EvalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [activeMetric, setActiveMetric] = useState<ActiveMetric>('pf_p1');
  const [selectedPlant, setSelectedPlant] = useState<PlantKey>('plant1');

  const { pinnedPoints, setPinnedPoints, handleHover, handleUnhover, handleRelayout, handleClickAnnotation } =
    usePinnedPoints({ initial: meta?.pinnedPoints ?? null, activeMetric, selectedPlant });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const record = await loadGraphRecord(id);
        if (!record) throw new Error('This graph is no longer in the local repository.');

        // Decoding ~2.5M samples takes ~60 ms measured; fast enough to stay on
        // the main thread here rather than pay for a worker round-trip.
        const restored = restoreEvalData(record.meta, record.payload);
        if (cancelled) return;

        setMeta(record.meta);
        setEvalData(restored);
        setActiveMetric(record.meta.view.activeMetric);
        setSelectedPlant(record.meta.view.selectedPlant);
        setPinnedPoints(record.meta.pinnedPoints ?? []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id]);

  const availableMetrics = useMemo<ActiveMetric[]>(
    () => meta?.view.availableMetrics ?? [],
    [meta],
  );

  // Export reuses the Daily Evaluation services unchanged, so a graph exported
  // from history is byte-identical to one exported when it was generated.
  // Available to everyone including read-only users — exporting reads.
  const handleExportHtml = async () => {
    if (!meta || !evalData) return;
    await exportSingleGraphHtml({
      evalData,
      project: meta.project,
      showNccPCommand: meta.view.showNccPCommand,
      graphConfig: meta.graphConfig,
      activeMetric,
      selectedPlant,
      pinnedPoints,
    });
  };

  const handleCopyClipboard = async () => {
    if (!meta || !evalData || !chartContainerRef.current) return;
    await copyChartsToClipboard({
      container: chartContainerRef.current,
      evalData,
      project: meta.project,
      activeMetric,
      graphConfig: meta.graphConfig,
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-foreground/40 font-mono">
        <Loader2 size={28} className="animate-spin text-accent-blue" />
        <div className="text-[10px] uppercase tracking-widest">Restoring graph…</div>
      </div>
    );
  }

  if (error || !meta || !evalData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={28} className="text-red-500/70" />
        <div className="text-[11px] font-mono text-red-400 max-w-md">{error || 'Graph could not be restored.'}</div>
        <button
          onClick={onBack}
          className="h-7 px-3 text-[9px] font-bold font-mono rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1.5"
        >
          <ArrowLeft size={11} /> BACK TO REPOSITORY
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Provenance bar — who made this, when, from what */}
      <div className="px-3 py-1.5 border-b border-border-v bg-surface/40 flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="h-6 px-2 text-[9px] font-bold font-mono rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1 shrink-0"
          >
            <ArrowLeft size={10} /> BACK
          </button>
          <span className="text-[11px] font-bold font-mono text-accent-blue shrink-0">{meta.project}</span>
          <span className="flex items-center gap-1 text-[9px] font-mono text-foreground/60 shrink-0">
            <Calendar size={10} /> {meta.dataDate}
          </span>
          <span className="flex items-center gap-1 text-[9px] font-mono text-foreground/60 shrink-0">
            <User size={10} /> {meta.provenance.engineerName}
          </span>
          {meta.revision > 1 && (
            <span className="text-[8px] font-bold font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
              rev {meta.revision}
            </span>
          )}
          {meta.summary.hasNcc && (
            <span className="text-[8px] font-bold font-mono px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/30 shrink-0">
              NCC
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[8px] font-mono text-foreground/35 flex items-center gap-1">
            <Cpu size={9} /> {formatBytes(meta.payload.bytes)} · v{meta.provenance.appVersion}
          </span>
          <button
            onClick={handleCopyClipboard}
            title="Capture all subplots as a single image and copy to clipboard"
            className="h-6 px-2 text-[9px] rounded font-bold font-mono bg-blue-600 text-white hover:bg-blue-500 flex items-center gap-1 shadow-sm"
          >
            <Copy size={10} /> COPY
          </button>
          <button
            onClick={handleExportHtml}
            title="Export this graph as a standalone interactive HTML file"
            className="h-6 px-2 text-[9px] rounded font-bold font-mono bg-green-600 text-white hover:bg-green-500 flex items-center gap-1 shadow-sm"
          >
            <Download size={10} /> EXPORT HTML
          </button>
          {pinnedPoints.length > 0 && (
            <button
              onClick={() => setPinnedPoints([])}
              className="text-[8px] font-mono text-foreground/40 hover:text-red-400 border border-foreground/10 hover:border-red-400/30 px-1.5 py-0.5 rounded transition-colors"
            >
              Clear {pinnedPoints.length} pin{pinnedPoints.length > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Figure switcher — the same set of figures the engineer had */}
      {availableMetrics.length > 1 && (
        <div className="px-3 py-1.5 border-b border-border-v bg-background/20 flex items-center gap-1.5 flex-wrap shrink-0">
          <span className="text-[8px] font-mono uppercase tracking-wider text-foreground/40 mr-1">Figure:</span>
          {availableMetrics.map((m) => (
            <button
              key={m}
              onClick={() => setActiveMetric(m)}
              className={cn(
                'px-2 py-1 rounded text-[9px] font-mono font-bold transition-colors border',
                activeMetric === m
                  ? 'bg-accent-blue text-white border-accent-blue'
                  : 'bg-surface text-foreground/70 border-border-v hover:bg-foreground/5',
              )}
            >
              {metricLabel(m, meta.project)}
            </button>
          ))}
        </div>
      )}

      <div ref={chartContainerRef} className="flex-1 min-h-0 p-3">
        <GraphPanels
          evalData={evalData}
          graphConfig={meta.graphConfig}
          pinnedPoints={pinnedPoints}
          project={meta.project}
          selectedPlant={selectedPlant}
          activeMetric={activeMetric}
          showNccPCommand={meta.view.showNccPCommand}
          theme={theme}
          handleHover={handleHover}
          handleUnhover={handleUnhover}
          handleRelayout={handleRelayout}
          handleClickAnnotation={handleClickAnnotation}
        />
      </div>
    </div>
  );
}
