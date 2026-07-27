// Wire types for the shared graph repository.
//
// A saved graph is split in two, because the two halves have opposite access
// patterns: `GraphRecordMeta` is small, queried and listed constantly, and
// syncs on every poll; `payload` is 0.5-1 MB, immutable and fetched only when
// somebody actually opens that graph. Server-side this becomes a D1 row plus
// an R2 object.

import type { ActiveMetric, GraphConfig, PinnedPoint } from '@/types/graph';
import type { DeviationInfo, PlantKey, PlantValues, SocStats } from '@/types/eval-data';

export const SCHEMA_VERSION = 1;
export const CODEC_ID = 'essg-v1';

/** The 15 per-plant series every daily-evaluation figure draws from. */
export const SERIES_FIELDS = [
  'pTotal', 'pPccPVS', 'qBess', 'pPV', 'pBESS', 'qTotal', 'soc', 'freq',
  'vab', 'vbc', 'vca', 'cmdP', 'cmdQ', 'remoteP', 'dispatchP',
] as const;

export type SeriesField = (typeof SERIES_FIELDS)[number];

/** Who made this graph. Server-authoritative on upload: the sync API overwrites
 *  name/email from the access-key record so attribution cannot be spoofed by
 *  editing local settings. */
export interface GraphProvenance {
  engineerName: string;
  engineerEmail?: string;
  machineName?: string;
  appVersion: string;
  /** ISO-8601 with offset — when the engineer generated it. */
  generatedAt: string;
  /** ISO-8601 with offset — set by the server on commit. */
  uploadedAt?: string;
  /** File NAMES only, as provenance. Raw file contents are never stored. */
  sourceFileNames: string[];
}

/** Everything needed to reproduce what the engineer was looking at. */
export interface GraphViewState {
  activeMetric: ActiveMetric;
  selectedPlant: PlantKey;
  showNccPCommand: boolean;
  /** Figures offered for this project, so a viewer can switch between exactly
   *  the same set the engineer had. */
  availableMetrics: ActiveMetric[];
}

/** Scalars the figures render outside the traces: cycle boxes, SOC markers,
 *  deviation overlays and titles. Small enough to live in the metadata row. */
export interface GraphSummary {
  dataDate: string;
  plantCount: number;
  sampleCount: number;
  hasCycleData: boolean;
  hasNcc: boolean;
  dailyCycle: PlantValues;
  totalCycle: PlantValues;
  avgDailyCycle?: number;
  avgTotalCycle?: number;
  socStats?: PlantValues<SocStats>;
  deviations?: { highSOC: DeviationInfo; lowSOC: DeviationInfo };
}

/** X axis is described, not stored: the parser builds timestamps
 *  deterministically from dataDate + a 1 Hz loop, so 86,400 Date objects are
 *  pure redundancy on the wire. The decoder regenerates them identically. */
export interface GraphAxis {
  /** "00:00:00" */
  xStart: string;
  xStepSeconds: number;
  xCount: number;
}

export interface GraphPayloadInfo {
  bytes: number;
  /** Hex SHA-256 of the gzipped payload. Dedupes re-uploads and detects
   *  corruption after a partial download. */
  sha256: string;
  codec: string;
}

export interface GraphRecordMeta {
  id: string;
  schemaVersion: number;
  project: string;
  /** Plant-local date, YYYY-MM-DD, from extractDataDate(). */
  dataDate: string;
  revision: number;
  isLatest: boolean;
  provenance: GraphProvenance;
  view: GraphViewState;
  graphConfig: GraphConfig;
  pinnedPoints: PinnedPoint[];
  axis: GraphAxis;
  summary: GraphSummary;
  payload: GraphPayloadInfo;
}

/** A complete record: metadata plus the encoded series block. */
export interface GraphRecord {
  meta: GraphRecordMeta;
  payload: Uint8Array;
}

/** Header carried inside the payload so a block is self-describing even if it
 *  is ever separated from its metadata row. */
export interface PayloadManifest {
  schemaVersion: number;
  codec: string;
  dataDate: string;
  xCount: number;
  xStepSeconds: number;
  /** "plant1.pTotal" -> block location + the precision it was quantized at. */
  series: Record<string, { offset: number; length: number; precision: number }>;
}
