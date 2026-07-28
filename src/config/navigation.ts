// The navigation, as data.
//
// Organised by what the user is doing, never by internal module names. Adding a
// feature means adding an entry — the structure is meant to survive for years.
// See docs/DESIGN_SYSTEM.md §5.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE IDS ARE FROZEN. DO NOT RENAME THEM.
//
// `activeTab` is persisted to localStorage, and the body dispatch matches these
// exact strings. Renaming `soc` to `daily_evaluation` would put every existing
// user on a blank screen with no error and no way back except clearing storage.
//
// They are legacy and they do not match their labels — `signal` is Import &
// Validate, `power` is Cycle Calculation, `soc` is Daily Evaluation, `export` is
// Reports. That mismatch is the price of not breaking people. The id is a
// private key; the label is the product.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Activity,
  Archive,
  Battery,
  Bot,
  Database,
  Download,
  Gauge,
  Grid2X2,
  Home,
  Send,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type NavGroupId = 'overview' | 'data' | 'analysis' | 'results' | 'assistant' | 'administration';

export interface NavItemConfig {
  /** Frozen. See the warning above. */
  id: string;
  label: string;
  icon: LucideIcon;
  group: NavGroupId;
  /** Shown even to read-only accounts. Everything else is hidden from them,
   *  because every other module exists to import or transform data they
   *  cannot publish. */
  availableToViewers?: boolean;
  /** Restricts an item to a role. Absent means every activated user. */
  requiresRole?: 'admin';
}

export interface NavGroupConfig {
  id: NavGroupId;
  /** Absent renders the items with no heading — used for single-item groups
   *  so "Home" does not get a "HOME" label above it. */
  label?: string;
}

/** Order is deliberate and stable. New groups go at the end, before settings. */
export const NAV_GROUPS: NavGroupConfig[] = [
  { id: 'overview' },
  { id: 'data', label: 'Data' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'results', label: 'Results' },
  { id: 'assistant' },
  { id: 'administration', label: 'Administration' },
];

export const NAV_ITEMS: NavItemConfig[] = [
  { id: 'home', label: 'Home', icon: Home, group: 'overview', availableToViewers: true },

  { id: 'signal', label: 'Import & Validate', icon: Activity, group: 'data' },
  { id: 'telegram_ncc', label: 'NCC Data', icon: Send, group: 'data' },
  { id: 'database', label: 'Stored Files', icon: Database, group: 'data' },

  { id: 'soc', label: 'Daily Evaluation', icon: Battery, group: 'analysis' },
  { id: 'power', label: 'Cycle Calculation', icon: Zap, group: 'analysis' },
  { id: 'usable_capacity', label: 'Usable Capacity', icon: Gauge, group: 'analysis' },

  // Graph History is the read-only account's entire product, so it is the one
  // module they keep.
  { id: 'graph_repository', label: 'Graph History', icon: Archive, group: 'results', availableToViewers: true },
  { id: 'export', label: 'Reports & Export', icon: Download, group: 'results' },
  { id: 'dashboard', label: 'Plant Overview', icon: Grid2X2, group: 'results' },

  { id: 'ai', label: 'AI Assistant', icon: Bot, group: 'assistant' },
];

/** Every id the shell can render. Used to validate a rehydrated activeTab. */
export const KNOWN_TAB_IDS = new Set([
  ...NAV_ITEMS.map((i) => i.id),
  // Reachable but not in the nav — opened from within other screens.
  'smart_report',
]);

export const DEFAULT_TAB = 'home';

/**
 * Where the app should open.
 *
 * First launch → Home, so a new user is guided.
 * Returning user → whatever they had open, so an experienced user is not.
 * Unknown or stale id → Home rather than a blank screen. A saved tab could
 * come from an older build, a hand-edited store, or a removed feature; before
 * this it rendered nothing at all, with no error.
 */
export function resolveInitialTab(savedTab: string | null | undefined, readOnly: boolean): string {
  if (readOnly) return 'graph_repository';
  if (!savedTab || !KNOWN_TAB_IDS.has(savedTab)) return DEFAULT_TAB;
  return savedTab;
}

/** One predicate, applied once — never conditional JSX in the sidebar. */
export function visibleNavItems(opts: { readOnly: boolean; role?: string | null }): NavItemConfig[] {
  return NAV_ITEMS.filter((item) => {
    if (item.requiresRole === 'admin' && opts.role !== 'admin') return false;
    if (opts.readOnly && !item.availableToViewers) return false;
    return true;
  });
}

/**
 * What to load next, before the user asks for it.
 *
 * Keyed by where they are now; fetched during idle time so it never competes
 * with the module they are actually waiting for. See docs/DESIGN_SYSTEM.md §9.
 */
export const PRELOAD_AFTER: Record<string, string[]> = {
  home: ['soc', 'graph_repository'],
  signal: ['soc'],
  soc: ['export', 'graph_repository'],
  graph_repository: ['soc'],
  telegram_ncc: ['soc'],
  power: ['soc'],
};
