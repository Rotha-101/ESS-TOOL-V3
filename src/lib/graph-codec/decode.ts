// essg-v1 decoder: gzipped payload -> the per-plant series EvalData expects.
//
// Decoders must keep reading every codec version ever shipped. An engineer on
// last month's build has to be able to open a graph uploaded today, so version
// branches are added here, never replaced.

import { gunzipSync } from 'fflate';
import type { PlantKey, PlantSeries } from '@/types/eval-data';
import { ByteReader, zigzagDecode } from './varint';
import { CODEC_ID, SERIES_FIELDS, type PayloadManifest, type SeriesField } from './types';

/** Inverse of encodeSeries. `count` comes from the manifest, so a truncated
 *  block yields trailing NaN rather than a short array the panels would
 *  mis-align against the time axis. */
export function decodeSeries(block: Uint8Array, precision: number, count: number): number[] {
  const out = new Array<number>(count);
  const reader = new ByteReader(block);
  let prevQuantized = 0;
  let written = 0;

  while (written < count && !reader.exhausted) {
    if (reader.peek() === 0x00) {
      reader.byte();
      const run = reader.varint();
      for (let i = 0; i < run && written < count; i++) out[written++] = NaN;
      continue;
    }
    prevQuantized += zigzagDecode(reader.varint() - 1);
    out[written++] = prevQuantized * precision;
  }

  while (written < count) out[written++] = NaN;
  return out;
}

const emptySeries = (count: number): PlantSeries => ({
  plant1: new Array(count).fill(NaN),
  plant2: new Array(count).fill(NaN),
  plant3: new Array(count).fill(NaN),
});

export interface DecodedPayload {
  manifest: PayloadManifest;
  /** Always the full 3-plant shape, NaN-filled where a plant was not stored —
   *  GraphPanels indexes plant1/2/3 unconditionally. */
  series: Record<SeriesField, PlantSeries>;
  timestamps: Date[];
}

/** Rebuild the 1 Hz timestamp array the encoder deliberately did not store.
 *  Mirrors the loop in evaluationParser exactly: local midnight + i seconds. */
export function rebuildTimestamps(dataDate: string, count: number, stepSeconds = 1): Date[] {
  const [y, m, d] = dataDate.split('-').map(Number);
  const base = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0);
  const out = new Array<Date>(count);
  for (let i = 0; i < count; i++) {
    out[i] = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, i * stepSeconds);
  }
  return out;
}

export function decodeGraphPayload(gzipped: Uint8Array): DecodedPayload {
  const container = gunzipSync(gzipped);
  const headerLength = new DataView(
    container.buffer,
    container.byteOffset,
    container.byteLength,
  ).getUint32(0, true);

  const manifest: PayloadManifest = JSON.parse(
    new TextDecoder().decode(container.subarray(4, 4 + headerLength)),
  );

  if (manifest.codec !== CODEC_ID) {
    throw new Error(
      `Unsupported graph codec "${manifest.codec}". This build reads "${CODEC_ID}" — update the application to open this graph.`,
    );
  }

  const body = container.subarray(4 + headerLength);
  const count = manifest.xCount;

  const series = {} as Record<SeriesField, PlantSeries>;
  for (const field of SERIES_FIELDS) series[field] = emptySeries(count);

  for (const [key, meta] of Object.entries(manifest.series)) {
    const [plant, field] = key.split('.') as [PlantKey, SeriesField];
    if (!series[field]) continue; // field retired in a later schema — ignore
    series[field][plant] = decodeSeries(
      body.subarray(meta.offset, meta.offset + meta.length),
      meta.precision,
      count,
    );
  }

  return {
    manifest,
    series,
    timestamps: rebuildTimestamps(manifest.dataDate, count, manifest.xStepSeconds),
  };
}
