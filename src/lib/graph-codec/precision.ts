// Quantization step per series, in the series' own display unit.
//
// Every step here is far finer than the measuring instrument: POC meters are
// ~0.5% accuracy class, so 1 kW on a 60 MW plant (0.0017%) is noise-level.
// Chosen deliberately rather than "as fine as possible" — the step size is what
// makes delta-encoding compress, and over-fine steps buy nothing but bytes.
//
// Changing a value here is a CODEC CHANGE: bump CODEC_ID and keep the old
// decoder, or previously stored graphs decode at the wrong scale.

import type { SeriesField } from './types';

export const SERIES_PRECISION: Record<SeriesField, number> = {
  // Active power, MW -> 1 kW steps
  pTotal: 0.001,
  pPccPVS: 0.001,
  pPV: 0.001,
  pBESS: 0.001,
  cmdP: 0.001,
  remoteP: 0.001,
  dispatchP: 0.001,

  // Reactive power, MVar -> 1 kvar steps
  qTotal: 0.001,
  qBess: 0.001,
  cmdQ: 0.001,

  // SOC %, 0.01 steps. The panels render SOC with toFixed(1), so the worst
  // case 0.005 rounding error is below what is ever displayed.
  soc: 0.01,

  // Frequency Hz, 1 mHz steps (grid excursions of interest are >= 10 mHz)
  freq: 0.001,

  // Line voltages kV, 1 V steps
  vab: 0.001,
  vbc: 0.001,
  vca: 0.001,
};

/** Largest error the codec may introduce for a field: half a quantization step
 *  (round-to-nearest). Used by the round-trip tests. */
export const maxQuantizationError = (field: SeriesField): number =>
  SERIES_PRECISION[field] / 2;
