// The single place the application learns where its backend lives.
//
// Nothing else in the app may reference a raw endpoint. That rule is what
// makes the deployment model swappable: production ships a baked-in default,
// an administrator can override it on one machine, and a future enterprise
// build can inject its own without touching a line of application code.
//
// Resolution order, highest priority first:
//
//   1. Administrator override   — set in the admin panel, persisted locally
//   2. Build-time default       — __SYNC_SERVER_URL__, injected by Vite
//   3. Empty                    — treated as "not configured"; the app still
//                                 runs, entirely on local storage
//
// Deliberately NOT a React hook. Sync runs outside React (background passes,
// the Electron bridge), so the source of truth has to be reachable from plain
// functions. `useServerConfig` below is the thin view for components.

/** Build-time default. Injected by Vite's `define` — see vite.config.ts. */
const BUILD_DEFAULT: string =
  typeof __SYNC_SERVER_URL__ === 'string' ? __SYNC_SERVER_URL__ : '';

/** Reader for the administrator override. Injected once at startup by the
 *  store, so this module stays free of a store import — which would otherwise
 *  make it un-testable and drag React into the sync layer. */
type OverrideReader = () => string | null | undefined;

let readOverride: OverrideReader = () => null;

/** Wired once, from the store. See src/store/useAppStore.ts. */
export function connectServerConfig(reader: OverrideReader): void {
  readOverride = reader;
}

const normalise = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';

/** Where the backend is, right now. */
export function getServerUrl(): string {
  return normalise(readOverride()) || normalise(BUILD_DEFAULT);
}

/** True when the app has a backend to talk to at all. False is a legitimate,
 *  supported state — the app is local-first and fully usable without one. */
export function hasServerConfigured(): boolean {
  return getServerUrl().length > 0;
}

/** Whether the running build shipped with a default. Lets the admin panel say
 *  "using the built-in service" instead of showing a URL to a normal admin. */
export const hasBuildDefault = (): boolean => normalise(BUILD_DEFAULT).length > 0;

/** The build-time default, for the admin panel's "reset to default" action. */
export const getBuildDefault = (): string => normalise(BUILD_DEFAULT);

/**
 * Media/object storage endpoint.
 *
 * Today graph payloads travel over the same service as their metadata, so this
 * resolves to the same origin. It exists so that moving payloads to a
 * dedicated store later — R2, S3, anything — is a change here and nowhere
 * else. Media storage is a backend service, never something a user configures.
 */
export function getMediaStorageUrl(): string {
  return getServerUrl();
}
