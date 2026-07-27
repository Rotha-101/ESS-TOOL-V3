// Read-only inspection of everything this app persists. Backs the Database tab.
//
// Storage lives in three places and this module reports all of them honestly:
//   1. localforage  -> IndexedDB "ESS_Toolbox_Platform" / "ess_unified_store"
//      The real store: eval_data_*, cycle_history_*, validation_log_*
//   2. localStorage -> zustand persist blob + graph config
//   3. RAM only     -> caches that die on reload

import { getDBItem, getDBKeys } from '@/lib/db';

export type EntryKind =
  | 'evaluation'
  | 'cycle-history'
  | 'validation-log'
  | 'graph-index'
  | 'graph-meta'
  | 'graph-payload'
  | 'unknown';

export interface DbEntry {
  key: string;
  kind: EntryKind;
  project: string | null;
  bytes: number;
  summary: string;
}

export interface LocalStorageEntry {
  key: string;
  bytes: number;
  preview: string;
}

export const KIND_LABELS: Record<EntryKind, string> = {
  'evaluation': 'Evaluation dataset',
  'cycle-history': 'Cycle history',
  'validation-log': 'Validation log',
  'graph-index': 'Graph repository index',
  'graph-meta': 'Stored graph (metadata)',
  'graph-payload': 'Stored graph (series)',
  'unknown': 'Unknown',
};

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1))} ${units[i]}`;
}

// Structural size walk. Deliberately NOT JSON.stringify: one EvalData holds
// ~4M numbers across its 15 per-plant series, and stringifying it would build a
// multi-hundred-megabyte string just to measure it.
function estimateBytes(value: any, depth = 0): number {
  if (value == null || depth > 12) return 0;
  const t = typeof value;
  if (t === 'number') return 8;
  if (t === 'boolean') return 4;
  if (t === 'string') return value.length * 2;
  if (value instanceof Date) return 8;
  // Binary payloads (stored graphs) report their own size. Without this they
  // fall through to the object branch, where Object.keys() on a 800 KB
  // Uint8Array materialises 800,000 index strings.
  if (ArrayBuffer.isView(value)) return (value as ArrayBufferView).byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (Array.isArray(value)) {
    // Numeric series are the bulk of the payload — size them arithmetically
    // rather than element-by-element.
    if (value.length > 64 && typeof value[0] === 'number') return value.length * 8;
    let total = 0;
    for (const v of value) total += estimateBytes(v, depth + 1);
    return total;
  }
  if (t === 'object') {
    let total = 0;
    for (const k of Object.keys(value)) total += k.length * 2 + estimateBytes(value[k], depth + 1);
    return total;
  }
  return 0;
}

function classify(key: string): { kind: EntryKind; project: string | null } {
  if (key.startsWith('eval_data_')) return { kind: 'evaluation', project: key.slice('eval_data_'.length) };
  if (key.startsWith('cycle_history_')) return { kind: 'cycle-history', project: key.slice('cycle_history_'.length) };
  if (key.startsWith('validation_log_')) return { kind: 'validation-log', project: key.slice('validation_log_'.length) };
  // Graph repository. The project lives inside the record rather than in the
  // key (records are keyed by id so revisions of the same plant-day coexist).
  if (key === 'graph_index') return { kind: 'graph-index', project: null };
  if (key.startsWith('graph_meta_')) return { kind: 'graph-meta', project: null };
  if (key.startsWith('graph_payload_')) return { kind: 'graph-payload', project: null };
  return { kind: 'unknown', project: null };
}

function summarize(kind: EntryKind, value: any): string {
  if (value == null) return 'empty';

  if (kind === 'evaluation') {
    const date = value.dataDate || 'no date';
    const files = Array.isArray(value.processedFiles) ? value.processedFiles.length : 0;
    const samples = Array.isArray(value.timestamps) ? value.timestamps.length : 0;
    const plants = ['plant1', 'plant2', 'plant3'].filter(
      p => Array.isArray(value?.pTotal?.[p]) && value.pTotal[p].some((v: number) => v != null && !isNaN(v)),
    ).length;
    const ncc = ['plant1', 'plant2', 'plant3'].some(
      p => Array.isArray(value?.cmdP?.[p]) && value.cmdP[p].some((v: number) => v != null && !isNaN(v) && Math.abs(v) > 0.001),
    );
    return `${date} · ${plants} plant${plants === 1 ? '' : 's'} · ${samples.toLocaleString()} samples · ${files} file${files === 1 ? '' : 's'}${ncc ? ' · NCC merged' : ''}`;
  }

  if (kind === 'cycle-history') {
    const n = Array.isArray(value) ? value.length : 0;
    return `${n} record${n === 1 ? '' : 's'}`;
  }

  if (kind === 'validation-log') {
    const n = Array.isArray(value) ? value.length : 0;
    return `${n} file${n === 1 ? '' : 's'}`;
  }

  if (kind === 'graph-index') {
    const n = Array.isArray(value) ? value.length : 0;
    const projects = Array.isArray(value) ? new Set(value.map((e: any) => e?.project)).size : 0;
    return `${n} graph${n === 1 ? '' : 's'} across ${projects} project${projects === 1 ? '' : 's'}`;
  }

  if (kind === 'graph-meta') {
    const rev = value?.revision > 1 ? ` · rev ${value.revision}` : '';
    return `${value?.project ?? '?'} · ${value?.dataDate ?? 'no date'} · ${value?.provenance?.engineerName ?? 'unknown'}${rev}`;
  }

  if (kind === 'graph-payload') {
    const bytes = value?.byteLength ?? value?.length ?? 0;
    return `${formatBytes(bytes)} compressed (essg-v1)`;
  }

  return Array.isArray(value) ? `array (${value.length})` : typeof value;
}

/** Load every persisted entry one at a time, sizing and summarizing each.
 *  Sequential on purpose — evaluation datasets are large and holding several
 *  in memory simultaneously is what we are trying to help the user avoid. */
export async function readDbEntries(): Promise<DbEntry[]> {
  const keys = await getDBKeys();
  const entries: DbEntry[] = [];

  for (const key of keys) {
    const { kind, project } = classify(key);
    let value: any = null;
    try {
      value = await getDBItem<any>(key);
    } catch {
      entries.push({ key, kind, project, bytes: 0, summary: 'unreadable' });
      continue;
    }
    entries.push({ key, kind, project, bytes: estimateBytes(value), summary: summarize(kind, value) });
    value = null; // release before loading the next one
  }

  return entries.sort((a, b) => b.bytes - a.bytes);
}

export function readLocalStorage(): LocalStorageEntry[] {
  const out: LocalStorageEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const raw = localStorage.getItem(key) ?? '';
      out.push({
        key,
        bytes: (key.length + raw.length) * 2,
        preview: raw.length > 120 ? `${raw.slice(0, 120)}…` : raw,
      });
    }
  } catch { /* storage disabled */ }
  return out.sort((a, b) => b.bytes - a.bytes);
}

export interface QuotaInfo { usage: number; quota: number }

export async function readQuota(): Promise<QuotaInfo | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

/** Which IndexedDB databases actually exist on disk. Chromium-only API; returns
 *  null where unsupported so the UI can say "unknown" rather than "none". */
export async function readDatabaseNames(): Promise<string[] | null> {
  try {
    const anyIdb = indexedDB as any;
    if (typeof anyIdb.databases !== 'function') return null;
    const dbs = await anyIdb.databases();
    return dbs.map((d: any) => d.name).filter(Boolean);
  } catch {
    return null;
  }
}
