// essg-v1 encoder: EvalData series -> compact, gzipped payload.
//
// Measured on real SNTL600 telemetry (3 plants, 2026-06-02, 2.94M samples):
//   JSON               31.84 MB
//   JSON + gzip         5.29 MB
//   Float32 + gzip      4.78 MB
//   essg-v1 + gzip      0.83 MB   <- 2.6% of naive JSON
//
// Four transformations, each independently safe:
//   1. timestamps dropped   — regenerated from dataDate by the decoder
//   2. empty series dropped — an absent plant is 86,400 NaNs of nothing
//   3. quantize + delta     — 1 Hz telemetry barely moves between samples
//   4. gzip
//
// Layout:  [u32 headerLength][headerJson][block][block]...
// Each block is one series: varint tokens where 0x00 starts a NaN run
// (0x00, varint runLength) and any other token is varint(zigzag(delta) + 1).

import { gzipSync } from 'fflate';
import type { EvalData, PlantKey } from '@/types/eval-data';
import { SERIES_PRECISION } from './precision';
import { ByteWriter, zigzagEncode } from './varint';
import {
  CODEC_ID,
  SCHEMA_VERSION,
  SERIES_FIELDS,
  type PayloadManifest,
  type SeriesField,
} from './types';

/** A series is worth storing only if it holds at least one real number. */
export const hasSeriesData = (arr: unknown): arr is number[] =>
  Array.isArray(arr) && arr.some((v) => v != null && typeof v === 'number' && !isNaN(v));

/** Quantize -> delta -> zigzag varint, with run-length escapes for NaN gaps. */
export function encodeSeries(values: number[], precision: number): Uint8Array {
  const inv = 1 / precision;
  const out = new ByteWriter(Math.max(1024, values.length >> 2));
  let prevQuantized = 0;
  let i = 0;

  while (i < values.length) {
    const v = values[i];
    if (v == null || isNaN(v)) {
      let run = 0;
      while (i < values.length && (values[i] == null || isNaN(values[i]))) {
        run++;
        i++;
      }
      out.byte(0x00);
      out.varint(run);
      continue;
    }
    const q = Math.round(v * inv);
    // +1 keeps 0x00 reserved as the NaN-run marker
    out.varint(zigzagEncode(q - prevQuantized) + 1);
    prevQuantized = q;
    i++;
  }

  return out.toUint8Array();
}

export interface EncodeResult {
  payload: Uint8Array;
  /** Series actually written, e.g. ["plant1.pTotal", ...]. */
  storedSeries: string[];
  plantCount: number;
  sampleCount: number;
}

/**
 * Encode the plottable series of an EvalData into a single gzipped payload.
 * `presentPlants` should come from getProjectPlants(project) so a 2-plant
 * project never carries a third plant's worth of NaN.
 */
export function encodeGraphPayload(
  evalData: EvalData,
  presentPlants: PlantKey[],
  dataDate: string,
): EncodeResult {
  const manifest: PayloadManifest = {
    schemaVersion: SCHEMA_VERSION,
    codec: CODEC_ID,
    dataDate,
    xCount: evalData.timestamps?.length ?? 86400,
    xStepSeconds: 1,
    series: {},
  };

  const blocks: Uint8Array[] = [];
  const storedSeries: string[] = [];
  let offset = 0;

  for (const plant of presentPlants) {
    for (const field of SERIES_FIELDS as readonly SeriesField[]) {
      const arr = evalData[field]?.[plant];
      if (!hasSeriesData(arr)) continue;

      const precision = SERIES_PRECISION[field];
      const block = encodeSeries(arr, precision);
      const key = `${plant}.${field}`;

      manifest.series[key] = { offset, length: block.length, precision };
      storedSeries.push(key);
      blocks.push(block);
      offset += block.length;
    }
  }

  const headerBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const container = new Uint8Array(4 + headerBytes.length + offset);
  new DataView(container.buffer).setUint32(0, headerBytes.length, true);
  container.set(headerBytes, 4);

  let cursor = 4 + headerBytes.length;
  for (const block of blocks) {
    container.set(block, cursor);
    cursor += block.length;
  }

  return {
    payload: gzipSync(container, { level: 9 }),
    storedSeries,
    plantCount: presentPlants.filter((p) =>
      SERIES_FIELDS.some((f) => hasSeriesData(evalData[f]?.[p])),
    ).length,
    sampleCount: manifest.xCount,
  };
}
