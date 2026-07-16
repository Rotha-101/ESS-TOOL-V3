// Shared shape of the daily-evaluation dataset produced by
// parseEvaluationExcelFiles (DailyEvaluationGraph) and consumed by the
// graph panels, App.tsx export handlers, exportMatlab/exportGraphs and the
// portable HTML viewer.

export type PlantKey = 'plant1' | 'plant2' | 'plant3';

/** One value per plant (e.g. daily cycle numbers). */
export type PlantValues<T = number> = Record<PlantKey, T>;

/** One 86,400-slot (1 Hz) series per plant; gaps are NaN. */
export type PlantSeries = PlantValues<number[]>;

export interface SocStats {
  maxSoc: number;
  maxIdx: number;
  minSoc: number;
  minIdx: number;
}

export interface DeviationInfo {
  pair: string;
  text: string;
}

export interface EvalData {
  processedFiles: string[];
  timestamps: Date[];

  pTotal: PlantSeries;
  pPccPVS: PlantSeries;
  qBess: PlantSeries;
  pPV: PlantSeries;
  pBESS: PlantSeries;
  qTotal: PlantSeries;
  soc: PlantSeries;
  freq: PlantSeries;
  vab: PlantSeries;
  vbc: PlantSeries;
  vca: PlantSeries;
  cmdP: PlantSeries;
  cmdQ: PlantSeries;
  remoteP: PlantSeries;
  dispatchP: PlantSeries;

  dailyCycle: PlantValues;
  totalCycle: PlantValues;
  /** True when cycle numbers came from real sources (ESS cycle files or
   * cycle history); false/absent means estimates/mock fallbacks. */
  hasCycleData?: boolean;
  avgDailyCycle?: number;
  avgTotalCycle?: number;
  dataDate?: string;
  socStats?: PlantValues<SocStats>;
  deviations?: { highSOC: DeviationInfo; lowSOC: DeviationInfo };

  // Escape hatch during incremental typing: mock data and older persisted
  // records may carry extra fields; typed access above stays checked.
  [key: string]: any;
}
