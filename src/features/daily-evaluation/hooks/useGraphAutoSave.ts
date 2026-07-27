// Automatically snapshot a successfully generated graph into the local
// repository, with no button for the engineer to forget to press.
//
// Watching `evalData` rather than wrapping setEvalData is deliberate: the
// record needs graphConfig / pinnedPoints / activeMetric too, and those live in
// the component. One effect here covers all four ingest paths plus both NCC
// merge paths, instead of six call sites that can drift apart.
//
// Change detection is a cheap sampled signature, not a hash of the full
// dataset: building the real payload costs ~400 ms on a 3-plant project, and
// this effect re-runs on every mount and every project switch. The signature
// costs well under a millisecond and only lets through datasets that actually
// differ — a fresh parse, or an NCC merge that rewrote cmdP/remoteP.

import { useEffect, useRef } from 'react';
import { hasSignature, saveGraphRecord } from '@/lib/history-db';
import { SERIES_FIELDS } from '@/lib/graph-codec';
import type { EvalData, PlantKey } from '@/types/eval-data';
import type { ActiveMetric, GraphConfig, PinnedPoint } from '@/types/graph';
import { buildGraphRecord } from '../services/graphRecord';

/** Marker stashed on the dataset once saved. It rides along into IndexedDB, so
 *  a reload that restores the working set does not re-save it. */
const SIG_KEY = '__graphSignature';

const PLANTS: PlantKey[] = ['plant1', 'plant2', 'plant3'];

/** Sample every 997th slot (prime, so it never aligns with the 86,400 grid or
 *  with hourly periodicity) across every series. ~260 values per series. */
function cheapSignature(evalData: EvalData): string {
  let acc = 0x811c9dc5;
  let count = 0;
  for (const field of SERIES_FIELDS) {
    for (const plant of PLANTS) {
      const arr = evalData[field]?.[plant];
      if (!Array.isArray(arr) || arr.length === 0) continue;
      for (let i = 0; i < arr.length; i += 997) {
        const v = arr[i];
        // NaN and 0 must not collide: fold the index in as well.
        const n = v == null || isNaN(v) ? i * 2 + 1 : Math.round(v * 1000) * 2;
        acc = Math.imul(acc ^ (n & 0xffffffff), 0x01000193) >>> 0;
        count++;
      }
    }
  }
  return `${evalData.dataDate ?? ''}:${count}:${acc.toString(36)}`;
}

export interface GraphAutoSaveInput {
  evalData: EvalData | null;
  project: string;
  activeMetric: ActiveMetric;
  selectedPlant: PlantKey;
  showNccPCommand: boolean;
  graphConfig: GraphConfig;
  pinnedPoints: PinnedPoint[];
  engineerName: string;
  enabled?: boolean;
  onSaved?: (id: string) => void;
  onError?: (message: string) => void;
}

export function useGraphAutoSave({
  evalData,
  project,
  activeMetric,
  selectedPlant,
  showNccPCommand,
  graphConfig,
  pinnedPoints,
  engineerName,
  enabled = true,
  onSaved,
  onError,
}: GraphAutoSaveInput) {
  // Guards against the effect re-entering while an encode is in flight — a
  // second dataset can land during the ~400 ms encode.
  const inFlight = useRef(false);

  // Latest view state, read at save time. Keeping these in a ref instead of the
  // dependency array means toggling a legend or dragging a pin does not trigger
  // a re-save; the graph data is what defines a new record.
  const view = useRef({ activeMetric, selectedPlant, showNccPCommand, graphConfig, pinnedPoints, engineerName });
  view.current = { activeMetric, selectedPlant, showNccPCommand, graphConfig, pinnedPoints, engineerName };

  useEffect(() => {
    if (!enabled || !evalData || !project) return;
    if (inFlight.current) return;

    const signature = cheapSignature(evalData);
    if ((evalData as any)[SIG_KEY] === signature) return; // already captured

    let cancelled = false;
    inFlight.current = true;

    (async () => {
      try {
        // Persisted check first. The in-memory marker above dies with the
        // page, so without this every app start would re-encode the restored
        // working set (~400 ms) purely to rediscover it is already stored.
        if (await hasSignature(project, evalData.dataDate ?? '', signature)) {
          (evalData as any)[SIG_KEY] = signature;
          return;
        }

        const record = await buildGraphRecord({
          evalData,
          project,
          activeMetric: view.current.activeMetric,
          selectedPlant: view.current.selectedPlant,
          showNccPCommand: view.current.showNccPCommand,
          graphConfig: view.current.graphConfig,
          pinnedPoints: view.current.pinnedPoints,
          engineerName: view.current.engineerName,
        });
        if (cancelled) return;

        const outcome = await saveGraphRecord(record, signature);

        // Stamp the in-memory object so neither this effect nor a later reload
        // re-encodes the same dataset.
        (evalData as any)[SIG_KEY] = signature;

        if (outcome.status === 'saved') onSaved?.(outcome.entry.id);
      } catch (err: any) {
        // A failed snapshot must never break graph generation — the engineer
        // still has their graph on screen.
        console.error('Graph auto-save failed:', err);
        onError?.(err?.message ?? String(err));
      } finally {
        inFlight.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [evalData, project, enabled]);
}
