// Where an activation credential lives on this computer.
//
// Backed by the Electron main process, which encrypts it with safeStorage —
// DPAPI on Windows — so the ciphertext is bound to this Windows account. Copy
// the file to another machine or another user and it decrypts to nothing.
//
// There is no `get`. The renderer can ask whether a credential exists, and set
// or clear one, but can never read it back; only the main process sees the
// plaintext, and only to sign a request.

import { getSyncBridge } from '@/lib/sync/types';
import type { ActivationCache } from './types';

/**
 * Tidy up what a user pasted.
 *
 * Whitespace and grouping dashes are stripped; **case is preserved**. That
 * matters: credentials issued today are lowercase hex, and upper-casing them
 * would change their hash and reject a perfectly good code. Existing codes
 * contain no dashes or spaces, so stripping those is a no-op for them while
 * making a future grouped format (ESS-XXXX-XXXX) forgiving to retype.
 */
export const normaliseSecret = (raw: string): string =>
  String(raw ?? '').trim().replace(/[\s-]+/g, '');

export const dpapiActivationCache: ActivationCache = {
  async has() {
    const bridge = getSyncBridge();
    if (!bridge) return false;
    try {
      const res = await bridge.hasKey();
      return Boolean(res && res.ok !== false && res.hasKey);
    } catch {
      return false;
    }
  },

  async store(secret: string) {
    const bridge = getSyncBridge();
    if (!bridge) throw new Error('Activation is only available in the desktop application.');
    const res = await bridge.setKey(normaliseSecret(secret));
    if (res && res.ok === false) throw new Error(res.error || 'Could not save the activation.');
  },

  async clear() {
    const bridge = getSyncBridge();
    if (!bridge) return;
    try {
      await bridge.clearKey();
    } catch {
      /* Nothing stored, or the bridge is gone. Either way there is no
         credential left to worry about. */
    }
  },
};
