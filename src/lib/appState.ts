// What the application is doing, as one explicit state rather than a handful
// of booleans that have to be read together correctly.
//
// The scattered-flag version is what let the "View only" badge appear whenever
// the network dropped: `writable` was forced false while offline, and a
// separate piece of UI read it without knowing that. Deriving one state from
// all the inputs at once makes that class of contradiction unrepresentable.
//
// Deliberately a pure function with no imports beyond types — same discipline
// as decideReadOnly, and for the same reason: this decides what an entire
// class of user sees, so it must be testable directly rather than only through
// a React tree.

export type AppState =
  /** Nothing decided yet. Show a splash, never a half-configured shell. */
  | 'starting'
  /** No credential on this computer. Activation screen. */
  | 'activation_required'
  /** A credential exists but the service refused it — revoked or replaced. */
  | 'activation_rejected'
  /** Activated, service reachable, nothing in flight. */
  | 'ready'
  /** Activated, a sync pass is running. */
  | 'syncing'
  /** Activated, service unreachable. Everything local still works. */
  | 'offline'
  /** Activated and reachable, but the last pass had record-level failures. */
  | 'needs_attention'
  /** The user chose to work without connecting, or an administrator turned
   *  synchronisation off. Not a failure — a deliberate mode. */
  | 'local_only';

export interface AppStateInputs {
  /** From the activation provider. */
  activation: 'unknown' | 'none' | 'active' | 'pending' | 'rejected';
  /** Is synchronisation switched on at all? */
  syncEnabled: boolean;
  /** Latest sync pass phase. */
  phase: 'idle' | 'syncing' | 'ok' | 'offline' | 'error';
  /** Did the last completed pass report record-level failures? */
  hasFailures: boolean;
}

/** Everything the shell needs to know, decided once. */
export interface AppStatePolicy {
  state: AppState;
  /** Render the main application shell? */
  showShell: boolean;
  /** May this session send graphs to the service? */
  uploadsAllowed: boolean;
  /** May this session pull graphs from the service? */
  downloadsAllowed: boolean;
  /** One short line, written for a non-technical user. */
  message: string;
  /** Does this warrant the user's attention, or is it just information? */
  tone: 'neutral' | 'busy' | 'warning';
}

/**
 * Collapse the inputs into exactly one state.
 *
 * Order matters and encodes the priorities: activation questions outrank sync
 * questions, and a deliberate local mode outranks any network condition —
 * someone who chose to work unconnected should never be told they are offline
 * as though something were wrong.
 */
export function decideAppState(inputs: AppStateInputs): AppStatePolicy {
  const { activation, syncEnabled, phase, hasFailures } = inputs;

  if (activation === 'unknown') {
    return {
      state: 'starting',
      showShell: false,
      uploadsAllowed: false,
      downloadsAllowed: false,
      message: '',
      tone: 'neutral',
    };
  }

  if (activation === 'none' || activation === 'pending') {
    return {
      state: 'activation_required',
      showShell: false,
      uploadsAllowed: false,
      downloadsAllowed: false,
      message: '',
      tone: 'neutral',
    };
  }

  if (activation === 'rejected') {
    // Shell stays hidden: the credential is known-bad, so letting the user
    // work on would only produce graphs that cannot be shared, silently.
    return {
      state: 'activation_rejected',
      showShell: false,
      uploadsAllowed: false,
      downloadsAllowed: false,
      message: 'This computer is no longer authorised. Contact your administrator.',
      tone: 'warning',
    };
  }

  // Activated from here on.

  if (!syncEnabled) {
    return {
      state: 'local_only',
      showShell: true,
      uploadsAllowed: false,
      downloadsAllowed: false,
      message: 'Working on this computer only.',
      tone: 'neutral',
    };
  }

  if (phase === 'syncing') {
    return {
      state: 'syncing',
      showShell: true,
      uploadsAllowed: true,
      downloadsAllowed: true,
      message: 'Syncing…',
      tone: 'busy',
    };
  }

  if (phase === 'offline') {
    return {
      state: 'offline',
      showShell: true,
      // Attempts are still permitted — the queue drains itself the moment the
      // connection returns, without anyone pressing anything.
      uploadsAllowed: true,
      downloadsAllowed: true,
      message: 'Saved on this computer. Will sync when you are back online.',
      tone: 'neutral',
    };
  }

  if (phase === 'error' || hasFailures) {
    return {
      state: 'needs_attention',
      showShell: true,
      uploadsAllowed: true,
      downloadsAllowed: true,
      message: 'Some work could not be synced yet. It will be retried automatically.',
      tone: 'warning',
    };
  }

  return {
    state: 'ready',
    showShell: true,
    uploadsAllowed: true,
    downloadsAllowed: true,
    message: 'All work saved.',
    tone: 'neutral',
  };
}
