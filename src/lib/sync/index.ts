export * from './types';
export { RemoteTransport } from './remoteTransport';
export { runSync, ensurePayload, type SyncResult, type SyncOptions } from './syncService';

import { RemoteTransport } from './remoteTransport';
import { getServerUrl } from '@/lib/config/serverConfig';
import type { SyncTransport } from './types';

/** Single place the app decides what backs the repository. Adding a transport
 *  later means one more branch here and nothing else.
 *
 *  The endpoint defaults to whatever the server configuration provider
 *  resolves — a baked-in build default, or an administrator's override. No
 *  caller passes a URL in normal operation; the argument exists so the admin
 *  panel can test a candidate endpoint before committing to it. */
export function createTransport(serverUrl: string = getServerUrl()): SyncTransport {
  return new RemoteTransport(serverUrl);
}
