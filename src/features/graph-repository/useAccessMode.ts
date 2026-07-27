// Store-bound wrapper over the pure access rule in accessMode.ts.

import { useAppStore } from '@/store/useAppStore';
import { decideReadOnly } from './accessMode';

export function useIsReadOnly(): boolean {
  const sharedFolderPath = useAppStore((s) => s.sharedFolderPath);
  const syncEnabled = useAppStore((s) => s.sharedFolderSyncEnabled);
  const phase = useAppStore((s) => s.syncState.phase);
  const writable = useAppStore((s) => s.syncState.writable);
  const lastKnownWritable = useAppStore((s) => s.lastKnownWritable);

  return decideReadOnly({ sharedFolderPath, syncEnabled, phase, writable, lastKnownWritable });
}
