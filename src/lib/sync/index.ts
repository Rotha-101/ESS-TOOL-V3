export * from './types';
export { FolderTransport } from './folderTransport';
export { runSync, type SyncResult, type SyncOptions } from './syncService';

import { FolderTransport } from './folderTransport';
import type { SyncTransport } from './types';

/** Single place the app decides what backs the repository. Adding a transport
 *  later means one more branch here and nothing else. */
export function createTransport(sharedFolderPath: string): SyncTransport {
  return new FolderTransport(sharedFolderPath);
}
