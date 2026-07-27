// Usable Capacity calculation engine.
//
// This is a faithful, vectorised TypeScript port of the legacy MATLAB script
// `compute_usable_capacity` — but it reads directly from the ingested raw
// dataset (the `EvalData` "DataFrame") instead of parsing MATLAB .fig files.
//
// The ingested dataset is the single source of truth. For each plant it exposes
// three index-aligned 1 Hz series (one sample per second of the day, gaps = NaN):
//   - timestamps : Date[]      (shared across all plants; index i = second i)
//   - power      : number[]    Active Power at POC, MW  (charge < 0, discharge > 0)
//   - soc        : number[]    State of Charge, %
//
// Because the parser already lays data onto a sorted, duplicate-free, 1 Hz grid,
// the "sort by timestamp / drop duplicates" steps are satisfied by construction;
// here we still honour "ignore invalid rows" (NaN guards) and "skip invalid time
// intervals" (only integrate between two genuinely adjacent 1 s samples).

/** Per-second raw series for one plant, aligned by index (second-of-day). */
export interface PlantSeriesInput {
  /** Display name, e.g. "Plant 01". */
  name: string;
  /** Active Power (MW). Index i = second i. NaN = missing sample. */
  power: number[];
  /** State of Charge (%). Same indexing as `power`. NaN = missing sample. */
  soc: number[];
}

export interface PlantUsableCapacity {
  name: string;
  /** Total SOC consumed while charging, % (abs of summed consecutive ΔSOC). */
  chargeSocUsed: number;
  /** Total SOC consumed while discharging, %. */
  dischargeSocUsed: number;
  /** Integrated charge energy, MWh. */
  chargeEnergy: number;
  /** Integrated discharge energy, MWh. */
  dischargeEnergy: number;
  /** Charge Capacity = chargeEnergy / chargeSocUsed * 100, MWh. */
  chargeCapacity: number;
  /** Discharge Capacity = dischargeEnergy / dischargeSocUsed * 100, MWh. */
  dischargeCapacity: number;
  /** False when the plant had < 2 valid samples above threshold. */
  hasData: boolean;
}

export interface FleetSummary {
  eChargeActual: number;
  eDischargeActual: number;
  fleetChargeTimeH: number;
  fleetDischargeTimeH: number;
  avgChargeMW: number;
  avgDischargeMW: number;
  /** Sum of per-plant charge capacities, MWh. */
  chargeCapacity: number;
  /** Sum of per-plant discharge capacities, MWh. */
  dischargeCapacity: number;
  /** Round Trip Efficiency = dischargeCapacity / chargeCapacity. */
  rte: number;
}

export interface UsableCapacityResult {
  plants: PlantUsableCapacity[];
  fleet: FleetSummary;
}

/** Seconds a single 1 Hz interval spans, expressed in hours. */
const DT_HOURS = 1 / 3600;

/** Max gap (seconds) still treated as one continuous interval. Mirrors the
 *  MATLAB `dt_h < 2/3600` guard: only integrate across genuinely adjacent
 *  samples, so pauses/gaps in above-threshold operation are never counted. */
const MAX_GAP_SECONDS = 2;

const isNum = (v: number): boolean => typeof v === 'number' && Number.isFinite(v);

/**
 * Compute usable-capacity metrics for one plant.
 *
 * Algorithm (equivalent to the MATLAB reference):
 *   1. Select "execution" samples where |P| > threshold (NaN power excluded).
 *   2. Walk consecutive execution samples; keep an interval only when the two
 *      samples are < MAX_GAP_SECONDS apart (adjacent 1 Hz samples).
 *   3. For each kept interval, Δt = gap (h), ΔSOC = SOC change, and the leading
 *      sample's power sign decides charge (P<0) vs discharge (P>0).
 *   4. Energy = Σ |P| · Δt ; SOC used = |Σ ΔSOC| ; Capacity = Energy/SOCused·100.
 */
export function computePlantUsableCapacity(
  input: PlantSeriesInput,
  thresholdMW: number,
): PlantUsableCapacity {
  const { name, power, soc } = input;
  const n = Math.min(power.length, soc.length);

  // Build the ordered list of execution samples (|P| above threshold).
  const execIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = power[i];
    if (isNum(p) && Math.abs(p) > thresholdMW) execIdx.push(i);
  }

  const empty: PlantUsableCapacity = {
    name,
    chargeSocUsed: 0,
    dischargeSocUsed: 0,
    chargeEnergy: 0,
    dischargeEnergy: 0,
    chargeCapacity: NaN,
    dischargeCapacity: NaN,
    hasData: false,
  };
  if (execIdx.length < 2) return empty;

  let eCharge = 0;
  let eDischarge = 0;
  let dSocChargeSum = 0;
  let dSocDischargeSum = 0;

  for (let k = 0; k < execIdx.length - 1; k++) {
    const a = execIdx[k];
    const b = execIdx[k + 1];

    // Skip invalid time intervals: only integrate across adjacent samples.
    const gapSeconds = b - a;
    if (gapSeconds >= MAX_GAP_SECONDS) continue;

    // Ignore invalid rows: both SOC endpoints must be present.
    const socA = soc[a];
    const socB = soc[b];
    if (!isNum(socA) || !isNum(socB)) continue;

    const pLead = power[a]; // known finite & |·| > threshold
    const dSoc = socB - socA;
    const energy = Math.abs(pLead) * DT_HOURS;

    if (pLead < 0) {
      eCharge += energy;
      dSocChargeSum += dSoc;
    } else {
      eDischarge += energy;
      dSocDischargeSum += dSoc;
    }
  }

  const chargeSocUsed = Math.abs(dSocChargeSum);
  const dischargeSocUsed = Math.abs(dSocDischargeSum);

  return {
    name,
    chargeSocUsed,
    dischargeSocUsed,
    chargeEnergy: eCharge,
    dischargeEnergy: eDischarge,
    chargeCapacity: chargeSocUsed > 0 ? (eCharge / chargeSocUsed) * 100 : NaN,
    dischargeCapacity: dischargeSocUsed > 0 ? (eDischarge / dischargeSocUsed) * 100 : NaN,
    hasData: true,
  };
}

/**
 * Fleet charge/discharge time (hours) from the summed instantaneous power.
 *
 * Every plant already shares the same 1 Hz grid, so the MATLAB step of
 * interpolating each plant onto a common time base collapses to a per-index
 * sum. A second counts toward charge time when the fleet total power is below
 * -threshold, toward discharge time when above +threshold (NaN treated as 0).
 */
function computeFleetTimes(
  plants: PlantSeriesInput[],
  thresholdMW: number,
): { chargeTimeH: number; dischargeTimeH: number } {
  const n = plants.reduce((m, p) => Math.max(m, p.power.length), 0);
  let chargeTimeH = 0;
  let dischargeTimeH = 0;

  // Mirror MATLAB `P_mid = P_total(1:end-1)`: evaluate over N-1 intervals.
  for (let i = 0; i < n - 1; i++) {
    let pTotal = 0;
    for (const plant of plants) {
      const p = plant.power[i];
      if (isNum(p)) pTotal += p;
    }
    if (pTotal < -thresholdMW) chargeTimeH += DT_HOURS;
    else if (pTotal > thresholdMW) dischargeTimeH += DT_HOURS;
  }

  return { chargeTimeH, dischargeTimeH };
}

/**
 * Full usable-capacity computation for a set of plants.
 *
 * Fleet capacities are the sums of per-plant capacities (matching the MATLAB
 * `sum_UC_charge` / `sum_UC_discharge`); average power divides actual energy by
 * fleet on-time; RTE = discharge capacity / charge capacity.
 */
export function computeUsableCapacity(
  plants: PlantSeriesInput[],
  thresholdMW: number,
): UsableCapacityResult {
  const perPlant = plants.map(p => computePlantUsableCapacity(p, thresholdMW));

  const eChargeActual = perPlant.reduce((s, p) => s + p.chargeEnergy, 0);
  const eDischargeActual = perPlant.reduce((s, p) => s + p.dischargeEnergy, 0);

  // Fleet capacity = sum of plant capacities (skip plants with no valid SOC).
  const chargeCapacity = perPlant.reduce(
    (s, p) => s + (isNum(p.chargeCapacity) ? p.chargeCapacity : 0),
    0,
  );
  const dischargeCapacity = perPlant.reduce(
    (s, p) => s + (isNum(p.dischargeCapacity) ? p.dischargeCapacity : 0),
    0,
  );

  const { chargeTimeH, dischargeTimeH } = computeFleetTimes(plants, thresholdMW);

  return {
    plants: perPlant,
    fleet: {
      eChargeActual,
      eDischargeActual,
      fleetChargeTimeH: chargeTimeH,
      fleetDischargeTimeH: dischargeTimeH,
      avgChargeMW: chargeTimeH > 0 ? eChargeActual / chargeTimeH : NaN,
      avgDischargeMW: dischargeTimeH > 0 ? eDischargeActual / dischargeTimeH : NaN,
      chargeCapacity,
      dischargeCapacity,
      rte: chargeCapacity > 0 ? dischargeCapacity / chargeCapacity : NaN,
    },
  };
}
