// Activation, as the shell sees it.
//
// The UI never touches the credential store, the transport or the network — it
// asks this hook, which asks the provider. That is what keeps a future switch
// to SSO or certificate activation invisible above this line.

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import {
  describeDevice,
  getActivationProvider,
  getDeviceIdentity,
  type DeviceIdentity,
} from '@/lib/activation';
import { getSyncBridge } from '@/lib/sync/types';

const NO_DEVICE: DeviceIdentity = { userName: '', machineName: '' };

export function useActivation() {
  const activation = useAppStore((s) => s.activation);
  const setActivation = useAppStore((s) => s.setActivation);
  const setSyncEnabled = useAppStore((s) => s.setSyncEnabled);

  const [device, setDevice] = useState<DeviceIdentity>(NO_DEVICE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const provider = getActivationProvider();

  // Resolve once at startup. Until it answers, the shell shows nothing rather
  // than flashing an activation screen at an already-activated user.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Browser / dev-server: there is no credential store to consult, so
      // gating here would make `npm run dev` unusable. Treat as activated.
      if (!getSyncBridge()) {
        if (!cancelled) setActivation('active');
        return;
      }

      const [status, identity] = await Promise.all([
        provider.status(),
        getDeviceIdentity(),
      ]);
      if (cancelled) return;

      setDevice(identity);
      setActivation(status.state);
      if (status.message) setError(status.message);
    })();

    return () => { cancelled = true; };
    // Once, on mount. Re-running would re-probe on every render.
  }, []);

  const activate = useCallback(
    async (secret: string) => {
      setBusy(true);
      setError('');
      try {
        const result = await provider.activate({ secret, device });
        if (!result.ok) {
          setError(result.message || 'Could not activate this computer.');
          return false;
        }
        setActivation('active');
        return true;
      } finally {
        setBusy(false);
      }
    },
    [provider, device, setActivation],
  );

  /** Work without connecting. Not a failure mode — a deliberate choice, and
   *  the recovery path for anyone whose credential was cleared off-network. */
  const continueOffline = useCallback(() => {
    setSyncEnabled(false);
    setActivation('active');
  }, [setSyncEnabled, setActivation]);

  const signOut = useCallback(async () => {
    await provider.deactivate();
    setActivation('none');
  }, [provider, setActivation]);

  return {
    activation,
    device,
    deviceLabel: describeDevice(device),
    busy,
    error,
    prompt: provider.prompt,
    providerLabel: provider.label,
    activate,
    continueOffline,
    signOut,
  };
}
