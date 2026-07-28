// The seam between "how this device proves who it is" and everything above it.
//
// Today activation is a one-time code. Tomorrow it could be Entra ID, Google
// Workspace, LDAP, OAuth, a QR enrolment or a hardware certificate. The point
// of this interface is that none of those change the application's workflow:
// the shell asks `status()`, shows a screen if the answer is `none`, and calls
// `activate()`. What happens inside is the provider's business.
//
// Modelled on SyncTransport, which already proved the pattern here — the
// backend moved from a Windows share to Cloudflare without the app noticing.

/** Who this computer belongs to, as the operating system reports it. Never
 *  typed by a user, and never trusted for authorisation — the server decides
 *  that. Used for display and for record provenance. */
export interface DeviceIdentity {
  userName: string;
  machineName: string;
}

/** The account the backend says this device is acting as. Server-owned: the
 *  application must never let a user edit any of it. */
export interface ActivatedAccount {
  userName: string;
  role: 'engineer' | 'viewer' | 'admin' | 'unknown';
  /** May this account publish? Authoritative, from the server. */
  writable: boolean;
}

export type ActivationState =
  /** Not checked yet. The shell shows nothing rather than flashing a screen. */
  | 'unknown'
  /** No credential on this computer. Activation screen. */
  | 'none'
  /** Credential present and accepted. */
  | 'active'
  /** Credential submitted, awaiting approval elsewhere. Unused by the code
   *  provider; reserved so an approval-based provider needs no new state. */
  | 'pending'
  /** Credential present but the backend rejected it — revoked, or replaced.
   *  Distinct from `none`: the user did nothing wrong and must be told so. */
  | 'rejected';

export interface ActivationStatus {
  state: ActivationState;
  account?: ActivatedAccount;
  /** Already written for a human. Never a status code or a stack. */
  message?: string;
}

export interface ActivationResult {
  ok: boolean;
  /** Already written for a human. */
  message?: string;
  account?: ActivatedAccount;
}

/** What the activation screen must collect before it can call `activate`. */
export type ActivationPrompt =
  /** A code the administrator issued. */
  | 'code'
  /** Nothing — the provider can activate unattended (device auto-enrolment). */
  | 'none'
  /** An external flow owns the interaction (a browser sign-in, a QR scan). */
  | 'external';

export interface ActivationProvider {
  /** Stable id for logs and diagnostics. */
  readonly id: string;
  /** What the UI calls this, e.g. "Activation code", "Company sign-in". */
  readonly label: string;
  readonly prompt: ActivationPrompt;

  /** Is this device activated? Must never throw. */
  status(): Promise<ActivationStatus>;

  /** Attempt activation. `secret` is whatever `prompt` implies — a code for
   *  'code', ignored for 'none'. Must never throw. */
  activate(input: { secret?: string; device: DeviceIdentity }): Promise<ActivationResult>;

  /** Forget this device's credential. Local history is never touched. */
  deactivate(): Promise<void>;
}

/**
 * Where the credential lives on this computer.
 *
 * Separate from the provider because the storage question ("encrypted at rest,
 * bound to this Windows account") is the same whichever provider issued it.
 * The renderer can ask whether one exists, and set or clear it — but can never
 * read it back, which is why there is no `get`.
 */
export interface ActivationCache {
  has(): Promise<boolean>;
  store(secret: string): Promise<void>;
  clear(): Promise<void>;
}
