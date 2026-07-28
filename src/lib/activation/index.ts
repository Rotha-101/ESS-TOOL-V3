// Single place the application decides how devices are activated.
//
// Adding Entra ID, Google Workspace, LDAP, OAuth, QR enrolment or certificate
// activation later means writing one more ActivationProvider and one more
// branch here. Nothing above this file changes — the shell asks `status()`,
// renders a screen when the answer is `none`, and calls `activate()`.
//
// Exactly the shape createTransport() has in the sync layer, for the same
// reason: it is the seam that made replacing the backend cheap.

export * from './types';
export { getDeviceIdentity, describeDevice } from './deviceRegistration';
export { dpapiActivationCache, normaliseSecret } from './activationCache';
export { codeActivationProvider } from './codeProvider';

import { codeActivationProvider } from './codeProvider';
import type { ActivationProvider } from './types';

/** The provider this build uses. */
export function getActivationProvider(): ActivationProvider {
  return codeActivationProvider;
}
