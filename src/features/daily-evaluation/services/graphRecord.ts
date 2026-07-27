// Build and restore the "final graph dataset" — everything needed to redraw a
// Daily Evaluation Graph exactly as the engineer saw it, and nothing else.
//
// Deliberately NOT stored: raw imported spreadsheets, intermediate parse state,
// and the 86,400 timestamps (regenerated from dataDate on restore).
//
// The record's shape mirrors the snapshot the app already passes to the AI
// Agent tab in DailyEvaluationGraph — { evalData, activeMetric, selectedPlant,
// graphConfig, pinnedPoints, project }. Restoring therefore feeds the existing
// GraphPanels unchanged, so a synced graph renders identically to the original
// and future rendering fixes apply retroactively to all history.

import { getProjectPlants } from '@/lib/project-utils';
import {
  decodeGraphPayload,
  encodeGraphPayload,
  hasSeriesData,
  sha256Hex,
  SCHEMA_VERSION,
  SERIES_FIELDS,
  CODEC_ID,
  type GraphRecord,
  type GraphRecordMeta,
  type GraphSummary,
} from '@/lib/graph-codec';
import type { EvalData, PlantKey, PlantValues } from '@/types/eval-data';
import type { ActiveMetric, GraphConfig, PinnedPoint } from '@/types/graph';
import { getAvailableMetrics } from '../config/metricConfig';

/** Time-sortable id: lexical order matches creation order, which makes local
 *  history lists stable without a separate sort key. */
export function createGraphId(): string {
  const time = Date.now().toString(36).padStart(9, '0');
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${time}${rand}`;
}

export function getAppVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
}

const NUMERIC_PLANTS: PlantKey[] = ['plant1', 'plant2', 'plant3'];

const plantValues = (source: any): PlantValues => ({
  plant1: Number(source?.plant1 ?? NaN),
  plant2: Number(source?.plant2 ?? NaN),
  plant3: Number(source?.plant3 ?? NaN),
});

/** Same test the Database tab uses to report "NCC merged". */
const detectNcc = (evalData: EvalData): boolean =>
  NUMERIC_PLANTS.some((p) =>
    (evalData.cmdP?.[p] ?? []).some(
      (v: number) => v != null && !isNaN(v) && Math.abs(v) > 0.001,
    ),
  );

function buildSummary(evalData: EvalData, plantCount: number): GraphSummary {
  return {
    dataDate: evalData.dataDate ?? '',
    plantCount,
    sampleCount: evalData.timestamps?.length ?? 86400,
    hasCycleData: Boolean(evalData.hasCycleData),
    hasNcc: detectNcc(evalData),
    dailyCycle: plantValues(evalData.dailyCycle),
    totalCycle: plantValues(evalData.totalCycle),
    avgDailyCycle: evalData.avgDailyCycle,
    avgTotalCycle: evalData.avgTotalCycle,
    socStats: evalData.socStats,
    deviations: evalData.deviations,
  };
}

export interface BuildGraphRecordInput {
  evalData: EvalData;
  project: string;
  activeMetric: ActiveMetric;
  selectedPlant: PlantKey;
  showNccPCommand: boolean;
  graphConfig: GraphConfig;
  pinnedPoints: PinnedPoint[];
  engineerName: string;
  engineerEmail?: string;
  machineName?: string;
}

/** Snapshot a generated graph into a storable, syncable record. */
export async function buildGraphRecord({
  evalData,
  project,
  activeMetric,
  selectedPlant,
  showNccPCommand,
  graphConfig,
  pinnedPoints,
  engineerName,
  engineerEmail,
  machineName,
}: BuildGraphRecordInput): Promise<GraphRecord> {
  const dataDate = evalData.dataDate ?? '';

  // Project shape decides which plants are real; anything beyond it is the
  // parser's unconditional 3-plant allocation and must not reach the wire.
  const declaredPlants = getProjectPlants(project) as PlantKey[];
  const presentPlants = declaredPlants.filter((p) =>
    SERIES_FIELDS.some((f) => hasSeriesData(evalData[f]?.[p])),
  );

  const { payload, plantCount, sampleCount } = encodeGraphPayload(
    evalData,
    presentPlants,
    dataDate,
  );

  const meta: GraphRecordMeta = {
    id: createGraphId(),
    schemaVersion: SCHEMA_VERSION,
    project,
    dataDate,
    revision: 1,
    isLatest: true,
    provenance: {
      engineerName,
      engineerEmail,
      machineName,
      appVersion: getAppVersion(),
      generatedAt: new Date().toISOString(),
      // Names only — the files themselves are never stored or uploaded.
      sourceFileNames: Array.isArray(evalData.processedFiles)
        ? [...evalData.processedFiles]
        : [],
    },
    view: {
      activeMetric,
      selectedPlant,
      showNccPCommand,
      availableMetrics: getAvailableMetrics(project),
    },
    graphConfig: { ...graphConfig },
    pinnedPoints: pinnedPoints.map((p) => ({ ...p })),
    axis: { xStart: '00:00:00', xStepSeconds: 1, xCount: sampleCount },
    summary: { ...buildSummary(evalData, plantCount), sampleCount },
    payload: {
      bytes: payload.byteLength,
      sha256: await sha256Hex(payload),
      codec: CODEC_ID,
    },
  };

  return { meta, payload };
}

/**
 * Rebuild a structurally valid EvalData from a stored record.
 *
 * The result is what GraphPanels consumes: full 3-plant series (NaN where a
 * plant was never stored), regenerated timestamps, and the scalar fields the
 * cycle boxes / SOC markers / deviation overlays read.
 */
export function restoreEvalData(meta: GraphRecordMeta, payload: Uint8Array): EvalData {
  const { series, timestamps } = decodeGraphPayload(payload);
  const s = meta.summary;

  const restored: any = {
    processedFiles: meta.provenance.sourceFileNames ?? [],
    timestamps,
    dataDate: s.dataDate || meta.dataDate,
    dailyCycle: s.dailyCycle,
    totalCycle: s.totalCycle,
    hasCycleData: s.hasCycleData,
    avgDailyCycle: s.avgDailyCycle,
    avgTotalCycle: s.avgTotalCycle,
    socStats: s.socStats,
    deviations: s.deviations,
  };

  for (const field of SERIES_FIELDS) restored[field] = series[field];

  return restored as EvalData;
}
