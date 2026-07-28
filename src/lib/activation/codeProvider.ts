// Activation by a one-time code issued by an administrator.
//
// The whole provider is: store what the user pasted, ask the backend who that
// makes us, keep it if the answer is good. The credential never expires, which
// is what lets a machine sit offline for months and still publish when it
// comes back — a property an expiring session would take away.
//
// Every message this file produces is already fit to show a user, because
// apiClient.cjs writes them that way ("Server not found. Check the server URL
// and your internet connection."). We pass them through rather than inventing
// our own, technical, worse versions.

import { createTransport } from '@/lib/sync';
import { hasServerConfigured } from '@/lib/config/serverConfig';
import { dpapiActivationCache } from './activationCache';
import type {
  ActivatedAccount,
  ActivationProvider,
  ActivationResult,
  ActivationStatus,
} from './types';

const toAccount = (status: {
  userName?: string | null;
  role?: string | null;
  writable?: boolean;
}): ActivatedAccount => ({
  userName: status.userName || '',
  role:
    status.role === 'admin' || status.role === 'engineer' || status.role === 'viewer'
      ? status.role
      : 'unknown',
  writable: Boolean(status.writable),
});

export const codeActivationProvider: ActivationProvider = {
  id: 'code',
  label: 'Activation code',
  prompt: 'code',

  async status(): Promise<ActivationStatus> {
    if (!(await dpapiActivationCache.has())) return { state: 'none' };

    // A credential exists. Whether the backend still accepts it is a separate
    // question, and one we must not block startup on: an engineer opening the
    // app on a train is activated, just offline.
    if (!hasServerConfigured()) {
      return { state: 'active' };
    }

    try {
      const probe = await createTransport().probe();

      if (probe.reachable && !probe.error) {
        return { state: 'active', account: toAccount(probe) };
      }

      // Reached the service and was refused — the credential was revoked or
      // replaced. The user did nothing wrong, and needs to be told that
      // plainly rather than being dumped back at a blank activation screen.
      if (probe.reachable) {
        return {
          state: 'rejected',
          message: probe.error || 'This computer is no longer authorised.',
        };
      }

      // Could not reach the service. Still activated; just offline.
      return { state: 'active' };
    } catch {
      // Never let a probe failure gate the app.
      return { state: 'active' };
    }
  },

  async activate({ secret }): Promise<ActivationResult> {
    const code = (secret ?? '').trim();
    if (!code) {
      return { ok: false, message: 'Enter the activation code your administrator gave you.' };
    }
    if (!hasServerConfigured()) {
      return {
        ok: false,
        message: 'This installation has no service configured. Contact your administrator.',
      };
    }

    try {
      await dpapiActivationCache.store(code);
    } catch (err: any) {
      return { ok: false, message: err?.message ?? 'Could not save the activation on this computer.' };
    }

    let probe;
    try {
      probe = await createTransport().probe();
    } catch (err: any) {
      await dpapiActivationCache.clear();
      return { ok: false, message: err?.message ?? 'Could not reach the service.' };
    }

    if (!probe.reachable || probe.error) {
      // Do not keep a credential we could not verify — otherwise the app looks
      // activated and quietly fails to sync, which is exactly the class of
      // problem 1.3.1 was spent fixing.
      await dpapiActivationCache.clear();
      return {
        ok: false,
        message: probe.error || 'Could not reach the service. Check your internet connection.',
      };
    }

    return { ok: true, account: toAccount(probe) };
  },

  async deactivate() {
    await dpapiActivationCache.clear();
  },
};
