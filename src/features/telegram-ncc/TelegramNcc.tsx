import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  Filter,
  Info,
  Layers,
  Loader2,
  RotateCcw,
  SearchX,
  Table as TableIcon,
  Terminal,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { EmsParser } from './emsParser';
import { ExportService } from './exportService';
import { filterEmsRecords } from './filterRecords';
import { ValidationStatus, type EmsRecord, type FilterState } from './types';
import { INITIAL_FILTERS, SUPPORTED_UNITS, UNIT_COLORS } from './constants';

const todayStamp = () => new Date().toISOString().split('T')[0];

/**
 * Telegram NCC Data module — ports the standalone PA Reporting Tool
 * (Telegram export → EMS records → filter/preview → CSV/XLSX) into this app,
 * restyled with the app's design tokens so it is theme-aware.
 */
export function TelegramNcc() {
  const [status, setStatus] = useState<ValidationStatus>(ValidationStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  // Records/filters live in the store, not local state, so they survive this
  // component unmounting on tab switch — that is what lets the Daily Evaluation
  // tab's "Reuse NCC Data" button see them.
  const records = useAppStore(s => s.telegramRecords);
  const setRecords = useAppStore(s => s.setTelegramRecords);
  const filters = useAppStore(s => s.telegramFilters);
  const setFilters = useAppStore(s => s.setTelegramFilters);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const processFile = (file: File) => {
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setError('Invalid file type. Only JSON files are supported.');
      setStatus(ValidationStatus.FAIL);
      return;
    }

    setFileName(file.name);
    setFileSize(formatFileSize(file.size));
    setStatus(ValidationStatus.PROCESSING);
    setError(null);

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const result = EmsParser.parse(json);
        setStatus(result.status);
        if (result.status === ValidationStatus.PASS) {
          setRecords(result.records);
        } else {
          setError(result.error || 'Failed to parse JSON.');
        }
      } catch {
        setStatus(ValidationStatus.FAIL);
        setError('Malformed JSON file. Please provide a valid JSON structure.');
      }
    };
    reader.onerror = () => {
      setStatus(ValidationStatus.FAIL);
      setError('Error reading file.');
    };
    reader.readAsText(file);
  };

  const filteredRecords = useMemo(
    () => filterEmsRecords(records, filters),
    [records, filters],
  );

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const reset = () => {
    setStatus(ValidationStatus.IDLE);
    setError(null);
    setRecords([]);
    setFilters(INITIAL_FILTERS);
    setFileName(null);
    setFileSize(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExportXLSX = () => {
    if (filteredRecords.length > 0)
      ExportService.downloadXLSX(filteredRecords, `EMS_Report_Filtered_${todayStamp()}`);
  };
  const handleExportCSV = () => {
    if (filteredRecords.length > 0)
      ExportService.downloadCSV(filteredRecords, `EMS_Report_Filtered_${todayStamp()}`);
  };

  const canExport = status === ValidationStatus.PASS && filteredRecords.length > 0;

  return (
    <section className="flex-1 min-h-0 flex gap-4 overflow-hidden">
      {/* ── Left control column ─────────────────────────────────────────── */}
      <div className="w-[344px] shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
        {/* Ingestion */}
        <div className="bg-panel border border-border-v rounded-lg p-4 shrink-0">
          <SectionLabel icon={<Terminal size={11} className="text-accent-blue" />}>
            Source Ingestion
          </SectionLabel>

          <div
            className={cn(
              'relative mt-3 border border-dashed rounded-md p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors',
              status === ValidationStatus.IDLE && 'border-border-v hover:border-accent-blue/50 hover:bg-foreground/[0.03]',
              status === ValidationStatus.PASS && 'border-emerald-500/40 bg-emerald-500/5',
              status === ValidationStatus.FAIL && 'border-rose-500/40 bg-rose-500/5',
              status === ValidationStatus.PROCESSING && 'border-accent-blue/40 bg-accent-blue/5 animate-pulse',
            )}
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={onFileChange} />
            {status === ValidationStatus.IDLE || !fileName ? (
              <>
                <FileJson className="text-foreground/40 mb-2" size={20} />
                <p className="text-foreground/60 text-[11px] font-medium">Drop Telegram log (.json)</p>
                <p className="text-foreground/30 text-[9px] mt-0.5">or click to browse</p>
              </>
            ) : (
              <div className="flex items-center gap-2.5 w-full">
                <div
                  className={cn(
                    'w-8 h-8 rounded flex items-center justify-center shrink-0',
                    status === ValidationStatus.PASS && 'bg-emerald-500/10 text-emerald-500',
                    status === ValidationStatus.FAIL && 'bg-rose-500/10 text-rose-500',
                    status === ValidationStatus.PROCESSING && 'bg-accent-blue/10 text-accent-blue',
                  )}
                >
                  <FileJson size={15} />
                </div>
                <div className="text-left overflow-hidden flex-1">
                  <p className="text-foreground/85 font-medium truncate text-[11px]">{fileName}</p>
                  <p className="text-foreground/40 text-[9px] font-mono uppercase">{fileSize}</p>
                </div>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    reset();
                  }}
                  className="p-1 hover:bg-foreground/10 rounded text-foreground/40 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-border-v/60">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[9px] font-bold text-foreground/40 uppercase tracking-widest">Engine Status</span>
              <StatusBadge status={status} />
            </div>

            {error && (
              <div className="bg-rose-500/5 border border-rose-500/20 rounded p-2.5 mb-3 flex items-start gap-2">
                <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={13} />
                <p className="text-rose-500/90 text-[10px] leading-snug font-medium">{error}</p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <button
                disabled={!canExport}
                onClick={handleExportXLSX}
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-foreground/10 disabled:text-foreground/30 rounded font-bold text-[11px] tracking-wide text-white transition-colors flex items-center justify-center gap-2"
              >
                <FileSpreadsheet size={13} />
                Generate XLSX
              </button>
              <button
                disabled={!canExport}
                onClick={handleExportCSV}
                className="w-full py-2 px-3 bg-foreground/10 hover:bg-foreground/15 disabled:bg-foreground/5 disabled:text-foreground/30 rounded font-bold text-[11px] tracking-wide text-foreground/80 transition-colors flex items-center justify-center gap-2"
              >
                <Download size={13} />
                Generate CSV
              </button>
            </div>
          </div>
        </div>

        {/* Constraints */}
        <div className="bg-panel border border-border-v rounded-lg p-4 shrink-0">
          <SectionLabel icon={<AlertTriangle size={11} className="text-amber-500/70" />}>
            Mapping Scope
          </SectionLabel>
          <div className="mt-3 flex gap-1.5 flex-wrap">
            {SUPPORTED_UNITS.map(u => (
              <span
                key={u}
                className={cn(
                  'text-[10px] font-mono px-2 py-0.5 rounded border uppercase',
                  'bg-accent-blue/5 border-accent-blue/15',
                  UNIT_COLORS[u]?.text ?? 'text-accent-blue',
                )}
              >
                {u}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-foreground/40 leading-snug">
            Strict entity linkage: <code className="text-accent-blue">#TAG</code> +{' '}
            <code className="text-accent-blue">plain</code> text per unit.
          </p>
        </div>

        {/* Analytics */}
        {filteredRecords.length > 0 && <StatisticsPanel records={filteredRecords} />}
      </div>

      {/* ── Right workspace ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden gap-3">
        {records.length > 0 && <DataSummary records={filteredRecords} />}

        <div className="bg-panel border border-border-v rounded-lg flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="px-4 py-2.5 border-b border-border-v shrink-0 flex items-center justify-between">
            <h2 className="text-[11px] font-bold text-foreground/70 uppercase tracking-widest flex items-center gap-2">
              <TableIcon size={14} className="text-accent-blue" /> Workspace Preview
            </h2>
            {records.length > 0 && (
              <div className="flex items-center gap-3 text-[10px] text-foreground/40 font-mono uppercase tracking-wider">
                <span>
                  Rows:{' '}
                  <span className="text-foreground/80 font-bold tabular-nums">{filteredRecords.length}</span>
                </span>
                <Layers size={11} className="opacity-40" />
              </div>
            )}
          </div>

          {records.length > 0 && (
            <FilterPanel filters={filters} setFilters={setFilters} onReset={() => setFilters(INITIAL_FILTERS)} />
          )}

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
            {records.length > 0 ? (
              filteredRecords.length > 0 ? (
                <DataPreview records={filteredRecords} activeUnits={filters.activeUnits} />
              ) : (
                <EmptyState icon={<SearchX size={30} />} title="No segments matched the filters" />
              )
            ) : (
              <EmptyState
                icon={<Activity size={36} className="animate-pulse" />}
                title="Operational buffer empty"
                message="Drop a Telegram export (.json) to populate data segments."
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="text-[9px] font-bold text-foreground/40 uppercase tracking-[0.2em] flex items-center gap-2">
      {icon}
      {children}
    </h2>
  );
}

function StatusBadge({ status }: { status: ValidationStatus }) {
  const map = {
    [ValidationStatus.PASS]: { icon: <CheckCircle2 size={12} />, label: 'Pass', cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' },
    [ValidationStatus.FAIL]: { icon: <XCircle size={12} />, label: 'Fail', cls: 'bg-rose-500/10 border-rose-500/30 text-rose-500' },
    [ValidationStatus.PROCESSING]: { icon: <Loader2 size={12} className="animate-spin" />, label: 'Processing', cls: 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue' },
    [ValidationStatus.IDLE]: { icon: <Info size={12} />, label: 'Idle', cls: 'bg-foreground/10 border-border-v text-foreground/50' },
  }[status];
  return (
    <div className={cn('flex items-center gap-1.5 px-2.5 py-0.5 border rounded-full text-[10px] font-semibold tracking-wide uppercase', map.cls)}>
      {map.icon}
      {map.label}
    </div>
  );
}

function DataSummary({ records }: { records: EmsRecord[] }) {
  if (records.length === 0) return null;
  const startTime = records[0].datetime;
  const endTime = records[records.length - 1].datetime;
  const dataPoints = records.length * 3 * 3;

  const StatBox = ({ icon: Icon, label, value, color }: any) => (
    <div className="flex-1 min-w-[130px] bg-panel border border-border-v rounded px-2.5 py-1.5 flex items-center gap-2.5">
      <div className={cn('p-1.5 rounded shrink-0', color)}>
        <Icon size={12} />
      </div>
      <div className="min-w-0">
        <p className="text-[8px] font-bold text-foreground/40 uppercase tracking-wide truncate leading-none mb-1">{label}</p>
        <p className="text-[11px] font-mono font-medium text-foreground/80 truncate tabular-nums leading-none">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="flex gap-2.5 shrink-0 overflow-x-auto">
      <StatBox icon={Database} label="Operational Logs" value={`${records.length} MSG`} color="bg-blue-500/10 text-blue-500" />
      <StatBox icon={Activity} label="Telemetry Points" value={dataPoints.toLocaleString()} color="bg-purple-500/10 text-purple-500" />
      <StatBox icon={Calendar} label="Sync Start" value={startTime} color="bg-emerald-500/10 text-emerald-500" />
      <StatBox icon={Clock} label="Sync End" value={endTime} color="bg-amber-500/10 text-amber-500" />
      <StatBox icon={Cpu} label="Engine State" value="Ready" color="bg-foreground/10 text-foreground/50" />
    </div>
  );
}

function FilterPanel({
  filters,
  setFilters,
  onReset,
}: {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  onReset: () => void;
}) {
  const toggleUnit = (unit: string) => {
    const next = filters.activeUnits.includes(unit)
      ? filters.activeUnits.filter(u => u !== unit)
      : [...filters.activeUnits, unit];
    setFilters({ ...filters, activeUnits: next });
  };
  const inputCls =
    'bg-background/60 border border-border-v rounded px-2 py-1 text-[11px] font-mono text-foreground/80 outline-none focus:border-accent-blue/50 transition-colors';

  return (
    <div className="bg-background/30 border-b border-border-v px-4 py-2.5 flex flex-wrap items-end gap-x-6 gap-y-3 shrink-0">
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <FilterLabel icon={<Calendar size={10} />}>Start Bound</FilterLabel>
          <input
            type="datetime-local"
            className={cn(inputCls, 'w-44')}
            value={filters.startDate}
            onChange={e => setFilters({ ...filters, startDate: e.target.value })}
          />
        </div>
        <ChevronRight size={12} className="text-foreground/30 mb-1.5" />
        <div className="flex flex-col gap-1">
          <FilterLabel icon={<Calendar size={10} />}>End Bound</FilterLabel>
          <input
            type="datetime-local"
            className={cn(inputCls, 'w-44')}
            value={filters.endDate}
            onChange={e => setFilters({ ...filters, endDate: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <FilterLabel icon={<Filter size={10} />}>Unit Matrix</FilterLabel>
        <div className="flex gap-1">
          {SUPPORTED_UNITS.map(unit => (
            <button
              key={unit}
              onClick={() => toggleUnit(unit)}
              className={cn(
                'px-2.5 py-1 rounded border text-[10px] font-bold transition-colors',
                filters.activeUnits.includes(unit)
                  ? 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue'
                  : 'bg-background/40 border-border-v text-foreground/40 hover:text-foreground/70',
              )}
            >
              {unit}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <FilterLabel icon={<Zap size={10} />}>Load Threshold</FilterLabel>
        <div className="relative">
          <input
            type="number"
            placeholder="0.00"
            className={cn(inputCls, 'w-24 pr-8')}
            value={filters.minP}
            onChange={e => setFilters({ ...filters, minP: e.target.value })}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-foreground/40">MW</span>
        </div>
      </div>

      <button
        onClick={onReset}
        className="ml-auto group flex items-center gap-2 px-3 py-1.5 text-foreground/40 hover:text-foreground/70 text-[10px] font-bold tracking-wide uppercase transition-colors"
      >
        <RotateCcw size={12} className="group-hover:rotate-[-120deg] transition-transform duration-500" />
        Reset
      </button>
    </div>
  );
}

function FilterLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="text-[9px] font-bold text-foreground/40 uppercase tracking-wider flex items-center gap-1.5">
      <span className="text-accent-blue/70">{icon}</span>
      {children}
    </label>
  );
}

function DataPreview({ records, activeUnits }: { records: EmsRecord[]; activeUnits: string[] }) {
  const units = SUPPORTED_UNITS.filter(u => activeUnits.includes(u));
  return (
    <div className="absolute inset-0 overflow-auto">
      <table className="w-full text-left border-collapse table-fixed">
        <thead className="sticky top-0 z-20">
          <tr className="bg-panel">
            <th className="w-44 px-4 py-2.5 text-[9px] font-bold text-foreground/40 uppercase tracking-widest border-b border-border-v">
              Timestamp
            </th>
            {units.map(unit => (
              <th
                key={unit}
                colSpan={3}
                className={cn(
                  'px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest border-l border-border-v/60 border-b border-border-v',
                  UNIT_COLORS[unit]?.text,
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('w-1.5 h-1.5 rounded-full', UNIT_COLORS[unit]?.dot)} />
                  {unit} Telemetry
                </div>
              </th>
            ))}
          </tr>
          <tr className="bg-panel">
            <th className="px-4 py-1.5 text-[8px] font-medium text-foreground/35 uppercase border-b border-border-v/60">
              UTC
            </th>
            {units.map(unit => (
              <React.Fragment key={unit}>
                <th className="px-4 py-1.5 text-[8px] font-medium text-foreground/35 uppercase border-l border-border-v/40 border-b border-border-v/60">P (MW)</th>
                <th className="px-4 py-1.5 text-[8px] font-medium text-foreground/35 uppercase border-b border-border-v/60">Q (MVAR)</th>
                <th className="px-4 py-1.5 text-[8px] font-medium text-foreground/35 uppercase border-b border-border-v/60">SOC (%)</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record, idx) => (
            <tr key={idx} className="hover:bg-accent-blue/[0.04] transition-colors border-b border-border-v/30">
              <td className="px-4 py-2 text-[11px] font-mono text-foreground/55 whitespace-nowrap">{record.datetime}</td>
              {units.map(unit => {
                const data = record.units[unit];
                const tint = UNIT_COLORS[unit]?.text;
                return (
                  <React.Fragment key={unit}>
                    <td className={cn('px-4 py-2 text-[11px] font-mono tabular-nums border-l border-border-v/30', data.p !== 0 ? tint : 'text-foreground/25')}>
                      {data.p.toFixed(2)}
                    </td>
                    <td className={cn('px-4 py-2 text-[11px] font-mono tabular-nums', data.q !== 0 ? tint : 'text-foreground/25')}>
                      {data.q.toFixed(2)}
                    </td>
                    <td className={cn('px-4 py-2 text-[11px] font-mono tabular-nums', data.soc !== 0 ? tint : 'text-foreground/25')}>
                      {data.soc.toFixed(1)}%
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="py-8 text-center text-[9px] text-foreground/30 font-mono uppercase tracking-[0.3em]">
        End of telemetry segment
      </div>
    </div>
  );
}

interface UnitStats {
  p: { min: number; max: number; avg: number; stdDev: number };
  q: { avg: number };
  soc: { min: number; max: number };
}

function StatisticsPanel({ records }: { records: EmsRecord[] }) {
  const [activeUnit, setActiveUnit] = useState<string>(SUPPORTED_UNITS[0]);

  const stats = useMemo(() => {
    if (records.length === 0) return null;
    const results: Record<string, UnitStats> = {};
    SUPPORTED_UNITS.forEach(unit => {
      const pVals = records.map(r => r.units[unit].p);
      const qVals = records.map(r => r.units[unit].q);
      const socVals = records.map(r => r.units[unit].soc);
      const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
      const pAvg = avg(pVals);
      const stdDev = Math.sqrt(avg(pVals.map(v => (v - pAvg) ** 2)));
      results[unit] = {
        p: { min: Math.min(...pVals), max: Math.max(...pVals), avg: pAvg, stdDev },
        q: { avg: avg(qVals) },
        soc: { min: Math.min(...socVals), max: Math.max(...socVals) },
      };
    });
    return results;
  }, [records]);

  const series = useMemo(() => records.map(r => r.units[activeUnit].p), [records, activeUnit]);

  if (!stats) return null;
  const s = stats[activeUnit];
  const color = UNIT_COLORS[activeUnit]?.hex ?? '#3b82f6';

  return (
    <div className="bg-panel border border-border-v rounded-lg overflow-hidden shrink-0">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <SectionLabel icon={<Activity size={12} className="text-accent-blue" />}>Analytics Engine</SectionLabel>
        <Info size={11} className="text-foreground/30" />
      </div>

      <div className="flex px-4 gap-1 mb-3 border-b border-border-v/60">
        {SUPPORTED_UNITS.map(unit => (
          <button
            key={unit}
            onClick={() => setActiveUnit(unit)}
            className={cn(
              'px-3 py-1.5 text-[10px] font-bold transition-colors relative',
              activeUnit === unit ? UNIT_COLORS[unit]?.text : 'text-foreground/40 hover:text-foreground/70',
            )}
          >
            {unit}
            {activeUnit === unit && (
              <span className={cn('absolute bottom-0 left-0 right-0 h-0.5', UNIT_COLORS[unit]?.dot)} />
            )}
          </button>
        ))}
      </div>

      <div className="px-4 pb-4 space-y-3">
        <div className="rounded border border-border-v/60 bg-background/40 overflow-hidden">
          <div className="px-3 pt-2 pb-1 flex items-center justify-between">
            <span className="text-[8px] text-foreground/40 font-bold uppercase tracking-widest">
              P (MW) Time Series
            </span>
            <span className={cn('text-[8px] font-mono font-bold', UNIT_COLORS[activeUnit]?.text)}>
              {activeUnit}
            </span>
          </div>
          <AreaChart values={series} color={color} />
        </div>

        <div className="bg-background/40 p-3 rounded border border-border-v/60 space-y-2.5">
          <div className="flex items-center gap-1.5 border-b border-border-v/60 pb-2">
            <Zap size={11} className="text-accent-blue/70" />
            <span className="text-[9px] font-bold text-foreground/50 uppercase tracking-wider">Active Power (MW)</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <MetricItem label="Max" value={s.p.max} suffix="MW" color="text-emerald-500" />
            <MetricItem label="Min" value={s.p.min} suffix="MW" color="text-rose-500" />
            <MetricItem label="Avg" value={s.p.avg} suffix="MW" color="text-accent-blue" />
            <MetricItem label="σ" value={s.p.stdDev} suffix="" color="text-foreground/60" />
          </div>
        </div>

        <div className="bg-background/40 p-3 rounded border border-border-v/60 space-y-2.5">
          <div className="flex items-center gap-1.5 border-b border-border-v/60 pb-2">
            <Activity size={11} className="text-purple-500/70" />
            <span className="text-[9px] font-bold text-foreground/50 uppercase tracking-wider">Operational</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MetricItem label="Avg Q" value={s.q.avg} suffix="MV" color="text-cyan-500" />
            <MetricItem label="Min SOC" value={s.soc.min} suffix="%" color="text-amber-500" decimals={0} />
            <MetricItem label="Max SOC" value={s.soc.max} suffix="%" color="text-emerald-500" decimals={0} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricItem({
  label,
  value,
  suffix,
  color,
  decimals = 1,
}: {
  label: string;
  value: number;
  suffix: string;
  color: string;
  decimals?: number;
}) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[8px] text-foreground/40 font-bold uppercase leading-none mb-1 truncate">{label}</span>
      <span className={cn('text-[13px] font-mono leading-none tabular-nums whitespace-nowrap', color)}>
        {value.toFixed(decimals)}
        {suffix && <span className="text-[8px] ml-0.5 opacity-60">{suffix}</span>}
      </span>
    </div>
  );
}

/** Dependency-free area/spark chart (replaces recharts). */
function AreaChart({ values, color }: { values: number[]; color: string }) {
  const W = 300;
  const H = 84;
  const pad = 6;
  if (values.length < 2) {
    return <div className="h-[84px] flex items-center justify-center text-[9px] text-foreground/25">Not enough points</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (W - pad * 2) / (values.length - 1);
  const y = (v: number) => pad + (H - pad * 2) * (1 - (v - min) / range);
  const pts = values.map((v, i) => [pad + i * stepX, y(v)] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H - pad} L${pts[0][0].toFixed(1)} ${H - pad} Z`;
  const gid = `tg-grad-${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[84px]">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* zero baseline if within range */}
      {min < 0 && max > 0 && (
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.12} strokeDasharray="3 3" className="text-foreground" />
      )}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function EmptyState({ icon, title, message }: { icon: React.ReactNode; title: string; message?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center text-foreground/30 px-8">
      <div className="mb-3 opacity-40">{icon}</div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/45">{title}</p>
      {message && <p className="text-[10px] mt-1.5 text-foreground/30 max-w-xs">{message}</p>}
    </div>
  );
}
