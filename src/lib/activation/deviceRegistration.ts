// Device registration — who and where this installation is.
//
// The identity comes from the operating system, never from a form. A user
// should not be asked for a device id, a machine name or a registration key;
// the computer already knows all three.
//
// This is display and provenance only. It is deliberately NOT an authorisation
// input: the backend decides what an account may do, from the credential.

import { getSyncBridge } from '@/lib/sync/types';
import type { DeviceIdentity } from './types';

const UNKNOWN: DeviceIdentity = { userName: '', machineName: '' };

/**
 * Ask the operating system who is signed in and on which machine.
 *
 * Resolves to empty strings rather than throwing when the bridge is absent
 * (browser/dev-server) — callers treat identity as decoration, so a missing
 * name must never block activation or graph generation.
 */
export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const bridge = getSyncBridge();
  if (!bridge) return UNKNOWN;

  try {
    const res = await bridge.identity();
    if (!res || res.ok === false) return UNKNOWN;
    return {
      userName: res.userName ?? '',
      machineName: res.machineName ?? '',
    };
  } catch {
    return UNKNOWN;
  }
}

/** "CHEA ROTHA on CHEAROTHA-PC", or the best available part of it. */
export function describeDevice(device: DeviceIdentity): string {
  if (device.userName && device.machineName) {
    return `${device.userName} on ${device.machineName}`;
  }
  return device.userName || device.machineName || 'this computer';
}
