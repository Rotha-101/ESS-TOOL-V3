import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Cpu,
  Database as DatabaseIcon,
  HardDrive,
  Layers,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDBItem, removeDBItem } from '@/lib/db';
import { hcByProject } from '@/lib/audit-engine.js';
import { useAppStore } from '@/store/useAppStore';
import {
  formatBytes,
  KIND_LABELS,
  readDatabaseNames,
  readDbEntries,
  readLocalStorage,
  readQuota,
  type DbEntry,
  type LocalStorageEntry,
  type QuotaInfo,
} from './storageInspector';

/**
 * Database tab — a read/delete browser over everything the app persists.
 * Nothing here computes or derives data; it only reports what is on disk and
 * in memory, so a stale dataset can be found and removed.
 */
export function DatabaseTab({ project }: { project: string }) {
  const [entries, setEntries] = useState<DbEntry[]>([]);
  const [lsEntries, setLsEntries] = useState<LocalStorageEntry[]>([]);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [dbNames, setDbNames] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [inspecting, setInspecting] = useState<{ key: string; json: string } | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const telegramRecords = useAppStore(s => s.telegramRecords);
  const evalDataCache = useAppStore(s => s.evalDataCache);
  const setEvalDataCache = useAppStore(s => s.setEvalDataCache);
  const auditStateVersion = useAppStore(s => s.auditStateVersion);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [db, q, names] = await Promise.all([readDbEntries(), readQuota(), readDatabaseNames()]);
      setEntries(db);
      setQuota(q);
      setDbNames(names);
      setLsEntries(readLocalStorage());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const totalBytes = useMemo(() => entries.reduce((s, e) => s + e.bytes, 0), [entries]);
  const lsTotal = useMemo(() => lsEntries.reduce((s, e) => s + e.bytes, 0), [lsEntries]);

  const handleDelete = async (key: string) => {
    await removeDBItem(key);
    // Drop the matching RAM cache too, otherwise the dataset appears deleted
    // here but the Daily Evaluation tab keeps serving it from memory.
    if (key.startsWith('eval_data_')) setEvalDataCache(key.slice('eval_data_'.length), null);
    setConfirmKey(null);
    await refresh();
  };

  const handleInspect = async (key: string) => {
    const value = await getDBItem<any>(key);
    let json: string;
    try {
      // Long numeric series are replaced by a marker — the raw arrays are
      // 86,400 entries each and unreadable (and slow) if printed in full.
      json = JSON.stringify(
        value,
        (_k, v) => (Array.isArray(v) && v.length > 64 && typeof v[0] === 'number'
          ? `[${v.length} numeric samples]`
          : v),
        2,
      );
    } catch {
      json = 'Could not serialize this entry.';
    }
    setInspecting({ key, json: json.length > 40000 ? `${json.slice(0, 40000)}\n\n… truncated` : json });
  };

  // In-memory validation files held by the audit engine (lost on reload)
  const validationFileCount = useMemo(() => {
    let n = 0;
    for (const plants of Object.values(hcByProject || {})) {
      for (const plant of (plants as any[]) || []) {
        for (const list of Object.values((plant as any).files || {})) n += ((list as any[]) || []).length;
      }
    }
    return n;
  }, [auditStateVersion, loading]);

  const cachedProjects = useMemo(
    () => Object.entries(evalDataCache).filter(([, v]) => v != null).map(([k]) => k),
    [evalDataCache],
  );

  const quotaPct = quota && quota.quota > 0 ? Math.min(100, (quota.usage / quota.quota) * 100) : 0;

  return (
    <section className="flex-1 min-h-0 bg-panel border border-border-v rounded-sm flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-v flex items-center justify-between bg-surface/50 shrink-0">
        <div className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-2">
          <DatabaseIcon size={14} className="text-accent-blue" />
          Database <span className="text-accent-blue opacity-80 pl-1">(Local Storage Manager)</span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-[9px] font-bold uppercase tracking-wider border border-border-v bg-surface/40 hover:bg-surface transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-clean p-4 flex flex-col gap-4">
        {/* Quota */}
        <div className="bg-background/30 border border-border-v rounded-lg p-4">
          <SectionLabel icon={<HardDrive size={11} className="text-accent-blue" />}>Storage Usage</SectionLabel>
          {quota ? (
            <div className="mt-3">
              <div className="flex justify-between text-[10px] font-mono mb-1.5">
                <span className="text-foreground/70">{formatBytes(quota.usage)} used</span>
                <span className="text-foreground/40">{formatBytes(quota.quota)} available</span>
              </div>
              <div className="h-2 bg-foreground/10 rounded-full overflow-hidden">
                <div
                  className={cn('h-full transition-all', quotaPct > 80 ? 'bg-red-500' : 'bg-accent-blue')}
                  style={{ width: `${Math.max(quotaPct, 0.5)}%` }}
                />
              </div>
              <div className="text-[9px] font-mono text-foreground/35 mt-1.5">
                {quotaPct.toFixed(2)}% of browser quota
              </div>
            </div>
          ) : (
            <div className="text-[10px] font-mono text-foreground/40 mt-3">Quota reporting unavailable.</div>
          )}

          {dbNames && (
            <div className="mt-4 pt-3 border-t border-border-v/50">
              <div className="text-[9px] uppercase tracking-widest text-foreground/40 font-bold mb-2">
                IndexedDB databases on disk
              </div>
              <div className="flex flex-wrap gap-1.5">
                {dbNames.length === 0 ? (
                  <span className="text-[10px] font-mono text-foreground/40">none</span>
                ) : dbNames.map(n => (
                  <span key={n} className="text-[9px] font-mono px-2 py-0.5 rounded bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Persisted datasets */}
        <div className="bg-background/30 border border-border-v rounded-lg p-4">
          <div className="flex items-center justify-between">
            <SectionLabel icon={<DatabaseIcon size={11} className="text-emerald-500" />}>
              Persisted Datasets
            </SectionLabel>
            <span className="text-[9px] font-mono text-foreground/40">
              {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} · {formatBytes(totalBytes)}
            </span>
          </div>
          <p className="text-[9px] font-mono text-foreground/35 mt-1">
            IndexedDB · ESS_Toolbox_Platform / ess_unified_store · survives restart
          </p>

          <div className="mt-3 flex flex-col gap-1">
            {loading ? (
              <div className="py-8 text-center text-[10px] font-mono text-foreground/40 flex items-center justify-center gap-2">
                <Loader2 size={12} className="animate-spin" /> Reading storage…
              </div>
            ) : entries.length === 0 ? (
              <div className="py-8 text-center text-[10px] font-mono text-foreground/35 uppercase tracking-widest">
                No persisted data yet.
              </div>
            ) : entries.map(e => (
              <div
                key={e.key}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded border transition-colors',
                  e.project === project
                    ? 'border-accent-blue/30 bg-accent-blue/5'
                    : 'border-transparent hover:border-border-v hover:bg-foreground/5',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono truncate" title={e.key}>{e.key}</span>
                    {e.project === project && (
                      <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-blue/15 text-accent-blue shrink-0">
                        active
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] font-mono text-foreground/45 truncate mt-0.5" title={e.summary}>
                    {KIND_LABELS[e.kind]} · {e.summary}
                  </div>
                </div>
                <span className="text-[10px] font-mono text-foreground/60 w-20 text-right shrink-0">
                  {formatBytes(e.bytes)}
                </span>
                <button
                  onClick={() => handleInspect(e.key)}
                  className="text-[9px] px-2.5 py-1 rounded font-bold border border-accent-blue/30 bg-accent-blue/10 text-accent-blue hover:bg-accent-blue hover:text-white transition-colors shrink-0"
                >
                  INSPECT
                </button>
                <button
                  onClick={() => setConfirmKey(e.key)}
                  title="Delete this entry"
                  className="p-1.5 rounded text-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Session memory */}
        <div className="bg-background/30 border border-border-v rounded-lg p-4">
          <SectionLabel icon={<Cpu size={11} className="text-amber-500" />}>Session Memory</SectionLabel>
          <p className="text-[9px] font-mono text-foreground/35 mt-1">
            Held in RAM only — cleared when the app is closed or reloaded.
          </p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <MemoryStat
              label="Cached datasets"
              value={cachedProjects.length}
              detail={cachedProjects.length ? cachedProjects.join(', ') : 'none'}
            />
            <MemoryStat
              label="Validation files"
              value={validationFileCount}
              detail={validationFileCount ? 'from Validation tab' : 'none loaded'}
            />
            <MemoryStat
              label="Telegram NCC records"
              value={telegramRecords.length}
              detail={telegramRecords.length ? 'available to reuse' : 'none loaded'}
            />
          </div>
        </div>

        {/* Browser storage */}
        <div className="bg-background/30 border border-border-v rounded-lg p-4">
          <div className="flex items-center justify-between">
            <SectionLabel icon={<Layers size={11} className="text-purple-500" />}>Browser Storage</SectionLabel>
            <span className="text-[9px] font-mono text-foreground/40">
              {lsEntries.length} key{lsEntries.length === 1 ? '' : 's'} · {formatBytes(lsTotal)}
            </span>
          </div>
          <p className="text-[9px] font-mono text-foreground/35 mt-1">
            localStorage · settings and preferences
          </p>
          <div className="mt-3 flex flex-col gap-1">
            {lsEntries.length === 0 ? (
              <div className="py-4 text-center text-[10px] font-mono text-foreground/35">empty</div>
            ) : lsEntries.map(e => (
              <div key={e.key} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-foreground/5 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-mono truncate">{e.key}</div>
                  <div className="text-[9px] font-mono text-foreground/40 truncate mt-0.5">{e.preview}</div>
                </div>
                <span className="text-[10px] font-mono text-foreground/60 w-20 text-right shrink-0">
                  {formatBytes(e.bytes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Inspect modal */}
      {inspecting && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-[10000]">
          <div className="bg-panel border border-border-v rounded-xl w-[56rem] max-w-[92vw] max-h-[80vh] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-v">
              <div className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-2">
                <DatabaseIcon size={13} className="text-accent-blue" />
                {inspecting.key}
              </div>
              <button
                onClick={() => setInspecting(null)}
                className="p-1 rounded text-foreground/50 hover:text-foreground hover:bg-foreground/10 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <pre className="flex-1 overflow-auto scrollbar-clean p-4 text-[10px] font-mono text-foreground/75 whitespace-pre-wrap">
              {inspecting.json}
            </pre>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmKey && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-[10000]">
          <div className="bg-panel border border-red-500/40 rounded-xl p-6 w-[30rem] max-w-[90vw] shadow-2xl flex flex-col gap-4">
            <h2 className="font-bold text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle size={16} /> Delete stored entry?
            </h2>
            <p className="text-[11px] font-mono text-foreground/70 break-all">{confirmKey}</p>
            <p className="text-[10px] text-foreground/50">
              This permanently removes the entry from local storage. Any tab currently showing it will need the
              source files re-loaded.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-border-v/50">
              <button
                onClick={() => setConfirmKey(null)}
                className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider border border-border-v rounded hover:bg-foreground/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmKey)}
                className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-foreground/50">
      {icon}
      {children}
    </div>
  );
}

function MemoryStat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="border border-border-v/60 rounded bg-panel/60 px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-widest text-foreground/40 font-bold">{label}</div>
      <div className="text-lg font-bold text-foreground/85 leading-tight mt-1">{value.toLocaleString()}</div>
      <div className="text-[9px] font-mono text-foreground/35 truncate mt-0.5" title={detail}>{detail}</div>
    </div>
  );
}
