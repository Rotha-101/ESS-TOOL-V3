// Store-bound wrapper over the pure access rule in accessMode.ts.

import { useAppStore } from '@/store/useAppStore';
import { decideReadOnly } from './accessMode';

export function useIsReadOnly(): boolean {
  const serverUrl = useAppStore((s) => s.serverUrl);
  const syncEnabled = useAppStore((s) => s.syncEnabled);
  const phase = useAppStore((s) => s.syncState.phase);
  const writable = useAppStore((s) => s.syncState.writable);
  const lastKnownWritable = useAppStore((s) => s.lastKnownWritable);

  return decideReadOnly({ serverUrl, syncEnabled, phase, writable, lastKnownWritable });
}
