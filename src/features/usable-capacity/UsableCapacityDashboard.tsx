import React from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Battery,
  Clock,
  Gauge,
  RefreshCw,
  Zap,
} from 'lucide-react';
import type { UsableCapacityResult, PlantUsableCapacity, FleetSummary } from './calc';
import { formatReportDate } from './report';

// ---- formatting helpers ------------------------------------------------------

const num = (v: number, d = 2): string =>
  Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';

// ---- charge / discharge accent system ---------------------------------------
// Charge = energy in (sky), Discharge = usable energy out (emerald). Both read
// well in light and dark; RTE hero uses the app accent-blue.

type Flow = 'charge' | 'discharge';
const ACCENT: Record<Flow, { text: string; soft: string; ring: string; dot: string; bar: string }> = {
  charge: {
    text: 'text-sky-600 dark:text-sky-400',
    soft: 'bg-sky-500/10',
    ring: 'ring-sky-500/20',
    dot: 'bg-sky-500',
    bar: 'bg-sky-500',
  },
  discharge: {
    text: 'text-emerald-600 dark:text-emerald-400',
    soft: 'bg-emerald-500/10',
    ring: 'ring-emerald-500/20',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
  },
};

// ---- small building blocks ---------------------------------------------------

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10.5px] uppercase tracking-wider text-foreground/40">{label}</span>
      <span className="font-mono text-[12px] tabular-nums text-foreground/80">
        {value}
        {unit && <span className="ml-1 text-[10px] text-foreground/35">{unit}</span>}
      </span>
    </div>
  );
}

/** One charge/discharge block: usable Capacity as hero, energy + SOC beneath. */
function FlowBlock({
  flow,
  capacity,
  energy,
  socUsed,
}: {
  flow: Flow;
  capacity: number;
  energy: number;
  socUsed: number;
}) {
  const a = ACCENT[flow];
  const Icon = flow === 'charge' ? ArrowDownToLine : ArrowUpFromLine;
  return (
    <div className={`flex-1 rounded-lg ring-1 ${a.ring} ${a.soft} p-3`}>
      <div className="flex items-center gap-1.5 mb-2.5">
        <Icon size={13} className={a.text} strokeWidth={2.4} />
        <span className={`text-[10px] font-bold uppercase tracking-widest ${a.text}`}>
          {flow}
        </span>
      </div>
      <div className="flex items-baseline gap-1 mb-3">
        <span className="font-mono text-[22px] leading-none font-semibold text-foreground tabular-nums">
          {num(capacity)}
        </span>
        <span className="text-[10px] text-foreground/40 font-medium">MWh</span>
      </div>
      <div className="text-[9px] uppercase tracking-wider text-foreground/30 mb-1.5">Capacity</div>
      <div className="space-y-1 pt-2.5 border-t border-border-v/60">
        <Metric label="Energy" value={num(energy)} unit="MWh" />
        <Metric label="SOC Used" value={num(socUsed)} unit="%" />
      </div>
    </div>
  );
}

/** Per-plant card: charge + discharge flow blocks and a round-trip footer. */
function PlantCard({ plant }: { plant: PlantUsableCapacity }) {
  const roundTrip =
    Number.isFinite(plant.chargeCapacity) && plant.chargeCapacity > 0
      ? (plant.dischargeCapacity / plant.chargeCapacity) * 100
      : NaN;

  return (
    <div className="rounded-xl border border-border-v bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground/[0.06] text-accent-blue">
            <Battery size={13} strokeWidth={2.2} />
          </span>
          <span className="text-[12px] font-bold uppercase tracking-wider text-foreground/85">
            {plant.name}
          </span>
        </div>
        {plant.hasData && Number.isFinite(roundTrip) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[9.5px] font-semibold text-foreground/55">
            <RefreshCw size={9} strokeWidth={2.5} />
            RT {num(roundTrip, 1)}%
          </span>
        )}
      </div>

      {plant.hasData ? (
        <div className="flex gap-2.5">
          <FlowBlock
            flow="charge"
            capacity={plant.chargeCapacity}
            energy={plant.chargeEnergy}
            socUsed={plant.chargeSocUsed}
          />
          <FlowBlock
            flow="discharge"
            capacity={plant.dischargeCapacity}
            energy={plant.dischargeEnergy}
            socUsed={plant.dischargeSocUsed}
          />
        </div>
      ) : (
        <div className="rounded-lg bg-background/50 px-3 py-6 text-center text-[11px] text-foreground/35">
          Not enough data above threshold.
        </div>
      )}
    </div>
  );
}

/** Circular RTE gauge (SVG). */
function RteRing({ rte }: { rte: number }) {
  const pct = Number.isFinite(rte) ? Math.max(0, Math.min(1, rte)) : 0;
  const r = 46;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <div className="relative flex h-[128px] w-[128px] items-center justify-center shrink-0">
      <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" strokeWidth="9" className="stroke-foreground/[0.08]" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          stroke="url(#rteGrad)"
          strokeDasharray={`${dash} ${c}`}
        />
        <defs>
          <linearGradient id="rteGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00A3FF" />
            <stop offset="100%" stopColor="#34D399" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-[26px] font-bold leading-none text-foreground tabular-nums">
          {Number.isFinite(rte) ? (rte * 100).toFixed(1) : '—'}
          <span className="text-[13px] text-foreground/40">%</span>
        </span>
        <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-foreground/40">
          RTE
        </span>
      </div>
    </div>
  );
}

function FleetStat({
  icon,
  label,
  value,
  unit,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  accent?: Flow;
}) {
  const tint = accent ? ACCENT[accent].text : 'text-foreground/45';
  return (
    <div className="rounded-lg bg-background/50 border border-border-v/50 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={tint}>{icon}</span>
        <span className="text-[9.5px] font-semibold uppercase tracking-wider text-foreground/40">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-[16px] font-semibold text-foreground/90 tabular-nums">
          {value}
        </span>
        {unit && <span className="text-[9.5px] text-foreground/35">{unit}</span>}
      </div>
    </div>
  );
}

function FleetSummarySection({ fleet }: { fleet: FleetSummary }) {
  return (
    <div className="rounded-xl border border-border-v bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Gauge size={14} className="text-accent-blue" />
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-foreground/70">
          Fleet Summary
        </h3>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        {/* RTE hero */}
        <div className="flex items-center gap-4 lg:pr-6 lg:border-r lg:border-border-v/60">
          <RteRing rte={fleet.rte} />
          <div className="space-y-2">
            <FleetMini
              flow="charge"
              label="Charge Capacity"
              value={num(fleet.chargeCapacity)}
              unit="MWh"
            />
            <FleetMini
              flow="discharge"
              label="Discharge Capacity"
              value={num(fleet.dischargeCapacity)}
              unit="MWh"
            />
          </div>
        </div>

        {/* Stat grid */}
        <div className="grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-3">
          <FleetStat
            icon={<Zap size={12} strokeWidth={2.4} />}
            label="E Charge Actual"
            value={num(fleet.eChargeActual)}
            unit="MWh"
            accent="charge"
          />
          <FleetStat
            icon={<Zap size={12} strokeWidth={2.4} />}
            label="E Discharge Actual"
            value={num(fleet.eDischargeActual)}
            unit="MWh"
            accent="discharge"
          />
          <FleetStat
            icon={<Gauge size={12} strokeWidth={2.4} />}
            label="Avg Charge"
            value={num(fleet.avgChargeMW)}
            unit="MW"
            accent="charge"
          />
          <FleetStat
            icon={<Clock size={12} strokeWidth={2.4} />}
            label="Fleet Charge Time"
            value={num(fleet.fleetChargeTimeH)}
            unit="h"
          />
          <FleetStat
            icon={<Clock size={12} strokeWidth={2.4} />}
            label="Fleet Discharge Time"
            value={num(fleet.fleetDischargeTimeH)}
            unit="h"
          />
          <FleetStat
            icon={<Gauge size={12} strokeWidth={2.4} />}
            label="Avg Discharge"
            value={num(fleet.avgDischargeMW)}
            unit="MW"
            accent="discharge"
          />
        </div>
      </div>
    </div>
  );
}

function FleetMini({
  flow,
  label,
  value,
  unit,
}: {
  flow: Flow;
  label: string;
  value: string;
  unit: string;
}) {
  const a = ACCENT[flow];
  return (
    <div className="flex items-center gap-2.5">
      <span className={`h-7 w-1 rounded-full ${a.bar}`} />
      <div>
        <div className="text-[9.5px] uppercase tracking-wider text-foreground/40">{label}</div>
        <div className="font-mono text-[15px] font-semibold text-foreground/90 tabular-nums">
          {value}
          <span className="ml-1 text-[9.5px] text-foreground/35">{unit}</span>
        </div>
      </div>
    </div>
  );
}

// ---- main dashboard ----------------------------------------------------------

export function UsableCapacityDashboard({
  result,
  thresholdMW,
  dataDate,
}: {
  result: UsableCapacityResult;
  thresholdMW: number;
  dataDate?: string;
}) {
  const n = result.plants.length;
  const plantCols =
    n >= 3 ? 'lg:grid-cols-3' : n === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-1 max-w-md';

  return (
    <div className="space-y-5">
      {/* Meta strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px]">
        <MetaItem label="Date" value={formatReportDate(dataDate)} />
        <MetaItem label="Power Threshold" value={`${thresholdMW.toFixed(2)} MW`} />
        <MetaItem label="Plants" value={String(n)} />
      </div>

      {/* Plant cards */}
      <div className={`grid grid-cols-1 gap-4 ${plantCols}`}>
        {result.plants.map(p => (
          <PlantCard key={p.name} plant={p} />
        ))}
      </div>

      {/* Fleet summary */}
      <FleetSummarySection fleet={result.fleet} />
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9.5px] font-semibold uppercase tracking-widest text-foreground/35">
        {label}
      </span>
      <span className="font-mono text-[12px] font-medium text-foreground/85 tabular-nums">
        {value}
      </span>
    </div>
  );
}
