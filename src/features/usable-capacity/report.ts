// Report formatting + dataset column detection for the Usable Capacity module.
// The text layout intentionally mirrors the legacy MATLAB console report so the
// output is directly comparable, line for line, with the previous engine.

import type { EvalData, PlantKey } from '@/types/eval-data';
import type { UsableCapacityResult, PlantSeriesInput } from './calc';
import { computePlantUsableCapacity } from './calc';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "2026-07-16" -> "16-Jul-2026" (matches the MATLAB `dd-mmm-yyyy` header). */
export function formatReportDate(dataDate?: string): string {
  if (!dataDate) return 'N/A';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataDate.trim());
  if (!m) return dataDate;
  const [, y, mm, dd] = m;
  const mon = MONTHS[Number(mm) - 1] ?? mm;
  return `${dd}-${mon}-${y}`;
}

/** The dataset "columns" required to run the engine. */
export const REQUIRED_COLUMNS = ['Timestamp', 'Plant', 'Active Power', 'SOC'] as const;

export interface ColumnDetection {
  ok: boolean;
  /** Human-readable names of any missing/empty required columns. */
  missing: string[];
  /** Plant keys that actually carry data for this project. */
  plantKeys: PlantKey[];
}

const seriesHasData = (arr: unknown): boolean =>
  Array.isArray(arr) && arr.some(v => typeof v === 'number' && Number.isFinite(v));

/**
 * Candidate "Active Power" sources, in the exact priority the legacy MATLAB
 * usable-capacity script resolves them from the `Active_Power_SOC_All_Plants`
 * figure.
 *
 * The MATLAB picks the axis line whose DisplayName *contains* "active power",
 * then falls back to the line containing "p total". In the app's own export the
 * only line containing "active power" is **"Remote Active Power"** (`remoteP`),
 * so whenever remote-dispatch data exists the fig-based engine was integrating
 * `remoteP` — NOT `pTotal`/`pPccPVS`. The "P total" fallback line is
 * `pPccPVS`-or-`pTotal` (the export's "Determine active power to use" rule).
 *
 * `remoteP` is forward-filled by the parser while `pTotal` is linearly
 * interpolated; that difference at the charge/discharge zero-crossing is what
 * shifts energy between charge and discharge, which is why matching the exact
 * source matters.
 *
 * Verified against the reference: integrating raw (un-rounded) `remoteP` with
 * raw `soc` reproduces the reference report exactly (mean abs error 0.0000 at
 * both 1 MW and 5 MW thresholds). Rounding the series to the fig's display
 * precision measurably *breaks* the match, so the series are used raw.
 */
export const ACTIVE_POWER_SOURCES: { key: keyof EvalData; label: string }[] = [
  { key: 'remoteP', label: 'Remote Active Power' },
  { key: 'pPccPVS', label: 'P total (POC · PVS)' },
  { key: 'pTotal', label: 'P total (POC)' },
];

export interface ActivePowerSelection {
  power: number[];
  label: string;
  sourceKey: keyof EvalData;
}

/** Select the active-power series for a plant, replicating the fig's line
 *  resolution: Remote Active Power → P (POC PVS) → P total. Raw values. */
export function selectActivePower(evalData: EvalData, pk: PlantKey): ActivePowerSelection {
  for (const src of ACTIVE_POWER_SOURCES) {
    const series = (evalData[src.key] as Record<PlantKey, number[]> | undefined)?.[pk];
    if (seriesHasData(series)) {
      return { power: series as number[], label: src.label, sourceKey: src.key };
    }
  }
  return { power: [], label: 'None', sourceKey: 'pTotal' };
}

/** SOC series for a plant (raw values). */
export function selectSoc(evalData: EvalData, pk: PlantKey): number[] {
  return evalData.soc?.[pk] ?? [];
}

/**
 * Auto-detect and validate the required columns on the ingested dataset.
 *
 * In this app the "DataFrame" is the fixed-shape `EvalData` object, so column
 * detection means confirming the timestamp axis, the plant dimension, and the
 * Active-Power / SOC series are present and non-empty for the given plants.
 */
export function detectColumns(
  evalData: EvalData | null,
  plantKeys: PlantKey[],
): ColumnDetection {
  const missing: string[] = [];
  if (!evalData) {
    return { ok: false, missing: [...REQUIRED_COLUMNS], plantKeys: [] };
  }

  if (!Array.isArray(evalData.timestamps) || evalData.timestamps.length === 0) {
    missing.push('Timestamp');
  }

  // The "Plant" + "Active Power" dimensions: at least one requested plant must
  // carry active-power data from any candidate source.
  const hasPower = (pk: PlantKey) =>
    ACTIVE_POWER_SOURCES.some(s =>
      seriesHasData((evalData[s.key] as Record<PlantKey, number[]> | undefined)?.[pk]),
    );
  const plantsWithPower = plantKeys.filter(hasPower);
  if (plantsWithPower.length === 0) {
    missing.push('Plant');
    missing.push('Active Power');
  }

  if (!plantKeys.some(pk => seriesHasData(evalData.soc?.[pk]))) {
    missing.push('SOC');
  }

  return { ok: missing.length === 0, missing, plantKeys: plantsWithPower };
}

/**
 * Assemble the per-plant raw series inputs from the dataset, choosing the
 * active-power source the same way the legacy .fig did (see
 * `ACTIVE_POWER_SOURCES`) and applying the fig's rounding.
 */
export function buildPlantInputs(
  evalData: EvalData,
  plantKeys: PlantKey[],
): PlantSeriesInput[] {
  return plantKeys.map((pk, i) => ({
    name: `Plant ${String(i + 1).padStart(2, '0')}`,
    power: selectActivePower(evalData, pk).power,
    soc: selectSoc(evalData, pk),
  }));
}

/** The active-power source label chosen for the current dataset (for display). */
export function activePowerSourceLabel(
  evalData: EvalData,
  plantKeys: PlantKey[],
): string {
  for (const pk of plantKeys) {
    const sel = selectActivePower(evalData, pk);
    if (sel.power.length) return sel.label;
  }
  return 'None';
}

const f4 = (v: number): string => (Number.isFinite(v) ? v.toFixed(4) : 'NaN');
const line = (label: string, value: string, width: number): string =>
  `${label.padEnd(width)}= ${value}`;

/**
 * Render the full report as monospace text, byte-for-byte comparable to the
 * MATLAB console output.
 */
export function formatReport(
  result: UsableCapacityResult,
  thresholdMW: number,
  dataDate: string | undefined,
): string {
  const PW = 28; // plant-section label column width
  const FW = 25; // fleet-summary label column width
  const rule = '='.repeat(44);
  const out: string[] = [];

  out.push(`Date: ${formatReportDate(dataDate)}`);
  out.push(line('Power Threshold', `${thresholdMW.toFixed(2)} MW`, FW));
  out.push(rule);

  for (const p of result.plants) {
    out.push('');
    out.push(`========== ${p.name} ==========`);
    if (!p.hasData) {
      out.push('Not enough data above threshold.');
      continue;
    }
    out.push(line('Total Charge SOC Used', `${f4(p.chargeSocUsed)} %`, PW));
    out.push(line('Total Discharge SOC Used', `${f4(p.dischargeSocUsed)} %`, PW));
    out.push(line('Charge Energy', `${f4(p.chargeEnergy)} MWh`, PW));
    out.push(line('Discharge Energy', `${f4(p.dischargeEnergy)} MWh`, PW));
    out.push(line('Charge Capacity', `${f4(p.chargeCapacity)} MWh`, PW));
    out.push(line('Discharge Capacity', `${f4(p.dischargeCapacity)} MWh`, PW));
  }

  const fl = result.fleet;
  out.push('');
  out.push('========== FLEET SUMMARY ==========');
  out.push('');
  out.push(line('E Charge Actual', `${f4(fl.eChargeActual)} MWh`, FW));
  out.push(line('E Discharge Actual', `${f4(fl.eDischargeActual)} MWh`, FW));
  out.push('');
  out.push(line('Fleet Charge Time', `${f4(fl.fleetChargeTimeH)} h`, FW));
  out.push(line('Fleet Discharge Time', `${f4(fl.fleetDischargeTimeH)} h`, FW));
  out.push('');
  out.push(line('Average Charge MW', `${f4(fl.avgChargeMW)} MW`, FW));
  out.push(line('Average Discharge MW', `${f4(fl.avgDischargeMW)} MW`, FW));
  out.push('');
  out.push(line('Charge Capacity', `${f4(fl.chargeCapacity)} MWh`, FW));
  out.push(line('Discharge Capacity', `${f4(fl.dischargeCapacity)} MWh`, FW));
  out.push('');
  out.push(line('RTE', f4(fl.rte), FW));
  out.push('-'.repeat(44));

  return out.join('\n');
}

// ---- diagnostics: compare every candidate power source -----------------------

export interface SourceDiagnosticRow {
  sourceKey: keyof EvalData;
  label: string;
  /** True for the source the engine actually used. */
  active: boolean;
  plants: { name: string; chargeEnergy: number; dischargeEnergy: number }[];
}

/**
 * For each candidate active-power source that carries data, compute per-plant
 * charge/discharge energy. Lets us confirm which source reproduces the legacy
 * MATLAB numbers (the fig-based engine used whichever line its DisplayName
 * matching resolved to — normally "Remote Active Power").
 */
export function computeSourceDiagnostics(
  evalData: EvalData,
  plantKeys: PlantKey[],
  thresholdMW: number,
): SourceDiagnosticRow[] {
  const chosen = activePowerSourceLabel(evalData, plantKeys);
  const rows: SourceDiagnosticRow[] = [];

  for (const src of ACTIVE_POWER_SOURCES) {
    const table = evalData[src.key] as Record<PlantKey, number[]> | undefined;
    if (!plantKeys.some(pk => seriesHasData(table?.[pk]))) continue;

    rows.push({
      sourceKey: src.key,
      label: src.label,
      active: src.label === chosen,
      plants: plantKeys.map((pk, i) => {
        const r = computePlantUsableCapacity(
          {
            name: `Plant ${String(i + 1).padStart(2, '0')}`,
            power: table?.[pk] ?? [],
            soc: selectSoc(evalData, pk),
          },
          thresholdMW,
        );
        return { name: r.name, chargeEnergy: r.chargeEnergy, dischargeEnergy: r.dischargeEnergy };
      }),
    });
  }

  return rows;
}
