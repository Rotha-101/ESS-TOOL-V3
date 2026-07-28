export * from './types';
export { RemoteTransport } from './remoteTransport';
export { runSync, ensurePayload, type SyncResult, type SyncOptions } from './syncService';

import { RemoteTransport } from './remoteTransport';
import type { SyncTransport } from './types';

/** Single place the app decides what backs the repository. Adding a transport
 *  later means one more branch here and nothing else. */
export function createTransport(serverUrl: string): SyncTransport {
  return new RemoteTransport(serverUrl);
}
