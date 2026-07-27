import React, { useMemo, useState } from 'react';
import { Gauge, Copy, Check, AlertTriangle, LayoutGrid, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getProjectPlants } from '@/lib/project-utils';
import type { PlantKey } from '@/types/eval-data';
import { useEvalData } from '@/features/daily-evaluation/hooks/useEvalData';
import { computeUsableCapacity } from './calc';
import {
  detectColumns,
  buildPlantInputs,
  formatReport,
  activePowerSourceLabel,
  computeSourceDiagnostics,
  REQUIRED_COLUMNS,
} from './report';
import { UsableCapacityDashboard } from './UsableCapacityDashboard';

const DEFAULT_THRESHOLD = 10;
type View = 'dashboard' | 'report';

/**
 * Usable Capacity module. Computes charge/discharge energy, SOC usage, per-plant
 * usable capacity and the fleet summary directly from the ingested dataset
 * (`EvalData`) — no MATLAB .fig files involved. Supported for SNTL projects.
 */
export function UsableCapacity({ project }: { project: string }) {
  const { evalData } = useEvalData(project, null);
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_THRESHOLD));
  const [view, setView] = useState<View>('dashboard');
  const [copied, setCopied] = useState(false);

  const isSntl = project?.startsWith('SNTL');
  const thresholdMW = (() => {
    const v = parseFloat(thresholdInput);
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_THRESHOLD;
  })();

  const plantKeys = getProjectPlants(project) as PlantKey[];
  const detection = useMemo(
    () => detectColumns(evalData, plantKeys),
    [evalData, project],
  );

  const result = useMemo(() => {
    if (!isSntl || !evalData || !detection.ok) return null;
    const inputs = buildPlantInputs(evalData, plantKeys);
    return computeUsableCapacity(inputs, thresholdMW);
  }, [isSntl, evalData, detection.ok, thresholdMW, project]);

  const report = useMemo(
    () => (result ? formatReport(result, thresholdMW, evalData?.dataDate) : ''),
    [result, thresholdMW, evalData],
  );

  const powerSource = useMemo(
    () => (isSntl && evalData && detection.ok ? activePowerSourceLabel(evalData, plantKeys) : ''),
    [isSntl, evalData, detection.ok, project],
  );

  const diagnostics = useMemo(
    () =>
      isSntl && evalData && detection.ok
        ? computeSourceDiagnostics(evalData, plantKeys, thresholdMW)
        : [],
    [isSntl, evalData, detection.ok, thresholdMW, project],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const Panel = ({ children }: { children: React.ReactNode }) => (
    <section className="flex-1 min-h-0 bg-panel border border-border-v rounded-sm flex flex-col overflow-hidden">
      {children}
    </section>
  );

  // Non-SNTL project: module is scoped to SNTL only.
  if (!isSntl) {
    return (
      <Panel>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
          <Gauge size={40} className="text-foreground/30" />
          <h2 className="text-sm font-semibold text-foreground/80">Usable Capacity</h2>
          <p className="text-[11px] text-foreground/40 max-w-sm">
            This module is available for SNTL projects only. The active project
            (<span className="font-mono">{project}</span>) is not supported.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border-v shrink-0">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-blue/10 text-accent-blue">
            <Gauge size={14} />
          </span>
          <div className="leading-tight">
            <div className="text-[12px] font-semibold text-foreground/85">Usable Capacity</div>
            <div className="text-[9px] uppercase tracking-wider text-foreground/35">
              Computed from raw dataset
            </div>
          </div>
        </div>

        {/* View toggle */}
        <div className="ml-3 flex items-center rounded-lg border border-border-v bg-background/40 p-0.5">
          <ToggleBtn active={view === 'dashboard'} onClick={() => setView('dashboard')}>
            <LayoutGrid size={12} /> Dashboard
          </ToggleBtn>
          <ToggleBtn active={view === 'report'} onClick={() => setView('report')}>
            <FileText size={12} /> Report
          </ToggleBtn>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-foreground/50">Power Threshold</label>
            <Input
              type="number"
              value={thresholdInput}
              onChange={e => setThresholdInput(e.target.value)}
              min={0}
              step={0.5}
              className="h-7 w-20 text-[12px] text-center font-mono"
            />
            <span className="text-[11px] text-foreground/50">MW</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!report}
            className="h-7 gap-1.5 text-[11px]"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy Report'}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {!evalData ? (
          <EmptyState
            title="No dataset loaded"
            message="Ingest a dataset in the Daily Evaluation Graph tab (or reuse the Validation tab data). The Usable Capacity report is computed directly from that raw dataset."
          />
        ) : !detection.ok ? (
          <EmptyState
            title="Missing required columns"
            icon="warn"
            message={`The dataset is missing: ${detection.missing.join(', ')}. Required columns: ${REQUIRED_COLUMNS.join(', ')}.`}
          />
        ) : (
          <div className="p-5">
            {powerSource && (
              <div className="mb-4 flex items-center gap-2 text-[11px]">
                <span className="text-[9.5px] font-semibold uppercase tracking-widest text-foreground/35">
                  Power Source
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-blue/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-accent-blue">
                  {powerSource}
                </span>
              </div>
            )}

            {view === 'dashboard' && result ? (
              <UsableCapacityDashboard
                result={result}
                thresholdMW={thresholdMW}
                dataDate={evalData.dataDate}
              />
            ) : (
              <pre className="font-mono text-[12px] leading-[1.5] text-foreground/90 whitespace-pre">
                {report}
              </pre>
            )}

            <SourceDiagnostics rows={diagnostics} thresholdMW={thresholdMW} />
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Collapsible per-source charge/discharge energy table, to confirm which
 *  power series reproduces the legacy MATLAB numbers. */
function SourceDiagnostics({
  rows,
  thresholdMW,
}: {
  rows: ReturnType<typeof computeSourceDiagnostics>;
  thresholdMW: number;
}) {
  if (rows.length < 1) return null;
  const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(4) : '—');

  return (
    <details className="mt-6 rounded-lg border border-border-v bg-background/30">
      <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-semibold text-foreground/60 hover:text-foreground/80">
        Diagnostics — charge/discharge energy by power source (threshold {thresholdMW.toFixed(2)} MW)
      </summary>
      <div className="overflow-x-auto px-3 pb-3">
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr className="text-foreground/40">
              <th className="py-1.5 pr-4 text-left font-medium">Power Source</th>
              <th className="py-1.5 pr-4 text-left font-medium">Plant</th>
              <th className="py-1.5 pr-4 text-right font-medium">Charge Energy (MWh)</th>
              <th className="py-1.5 pr-4 text-right font-medium">Discharge Energy (MWh)</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap(row =>
              row.plants.map((p, i) => (
                <tr
                  key={`${row.sourceKey}-${p.name}`}
                  className={row.active ? 'text-accent-blue' : 'text-foreground/70'}
                >
                  <td className="py-1 pr-4">
                    {i === 0 ? (
                      <span className="flex items-center gap-1.5">
                        {row.label}
                        {row.active && (
                          <span className="rounded bg-accent-blue/15 px-1 text-[9px] uppercase tracking-wide">
                            used
                          </span>
                        )}
                      </span>
                    ) : (
                      ''
                    )}
                  </td>
                  <td className="py-1 pr-4">{p.name}</td>
                  <td className="py-1 pr-4 text-right tabular-nums">{fmt(p.chargeEnergy)}</td>
                  <td className="py-1 pr-4 text-right tabular-nums">{fmt(p.dischargeEnergy)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors outline-none',
        active
          ? 'bg-foreground/10 text-foreground shadow-sm'
          : 'text-foreground/45 hover:text-foreground/70',
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  title,
  message,
  icon = 'info',
}: {
  title: string;
  message: string;
  icon?: 'info' | 'warn';
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8 py-16">
      {icon === 'warn' ? (
        <AlertTriangle size={34} className="text-amber-500/70" />
      ) : (
        <Gauge size={34} className="text-foreground/25" />
      )}
      <h2 className="text-[13px] font-semibold text-foreground/80">{title}</h2>
      <p className="text-[11px] text-foreground/45 max-w-md">{message}</p>
    </div>
  );
}
