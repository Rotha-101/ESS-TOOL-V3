// Settings panel for the shared graph repository.
//
// The path is configuration, never a build-time constant: IT can move the
// share and users repoint the app themselves. Test Connection reports the two
// facts that matter — can we reach it, and may this user write to it — because
// write permission is what makes someone an Engineer rather than a Management
// viewer.

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, FolderOpen, Loader2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { createTransport, getSyncBridge, type TransportStatus } from '@/lib/sync';

type TestResult = { state: 'idle' | 'testing' | 'done'; status?: TransportStatus };

export function SharedFolderSettings() {
  const sharedFolderPath = useAppStore((s) => s.sharedFolderPath);
  const setSharedFolderPath = useAppStore((s) => s.setSharedFolderPath);
  const enabled = useAppStore((s) => s.sharedFolderSyncEnabled);
  const setEnabled = useAppStore((s) => s.setSharedFolderSyncEnabled);

  const [result, setResult] = useState<TestResult>({ state: 'idle' });

  const handleTest = async () => {
    setResult({ state: 'testing' });
    try {
      const status = await createTransport(sharedFolderPath.trim()).probe();
      setResult({ state: 'done', status });
    } catch (err: any) {
      setResult({
        state: 'done',
        status: { reachable: false, writable: false, error: err?.message ?? String(err) },
      });
    }
  };

  const handleBrowse = async () => {
    const bridge = getSyncBridge();
    if (!bridge) return;
    const picked = await bridge.chooseFolder();
    if (picked) {
      setSharedFolderPath(picked);
      setResult({ state: 'idle' });
    }
  };

  const status = result.status;
  const showOk = result.state === 'done' && status?.reachable && !status?.error;
  const showProblem = result.state === 'done' && (!status?.reachable || Boolean(status?.error));

  return (
    <div className="space-y-4">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
        <FolderOpen size={12} /> Shared Graph Repository
      </h3>

      <div className="bg-surface/50 p-3 rounded border border-border-v space-y-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-medium">Shared Folder Path</span>
          <span className="text-[10px] text-foreground/40">
            Company folder where graph history is shared, e.g. \\fileserver\ESS\GraphRepository
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={sharedFolderPath}
            onChange={(e) => { setSharedFolderPath(e.target.value); setResult({ state: 'idle' }); }}
            placeholder="\\fileserver\ESS\GraphRepository"
            spellCheck={false}
            className="flex-1 h-8 px-2 rounded bg-panel border border-border-v text-[11px] font-mono text-foreground/90 placeholder:text-foreground/25 focus:outline-none focus:border-accent-blue"
          />
          {getSyncBridge() && (
            <button
              onClick={handleBrowse}
              className="h-8 px-2.5 text-[10px] font-bold rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1.5 shrink-0"
              title="Browse for the shared folder"
            >
              <FolderOpen size={12} /> Browse
            </button>
          )}
          <button
            onClick={handleTest}
            disabled={!sharedFolderPath.trim() || result.state === 'testing'}
            className="h-8 px-2.5 text-[10px] font-bold rounded bg-accent-blue hover:bg-blue-600 text-white flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:pointer-events-none"
          >
            {result.state === 'testing' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Test Connection
          </button>
        </div>

        {showOk && (
          <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
              <CheckCircle2 size={12} /> Connected
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-foreground/70">
              {status?.writable ? (
                <><Pencil size={10} className="text-emerald-400" /> Read &amp; write — you can publish graphs to the company history.</>
              ) : (
                <><Eye size={10} className="text-blue-400" /> Read only — you can view all company graphs but not publish.</>
              )}
            </div>
          </div>
        )}

        {showProblem && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-400">
              <AlertTriangle size={12} /> Not connected
            </div>
            <div className="text-[10px] font-mono text-foreground/70 leading-relaxed">
              {status?.error || 'The shared folder could not be reached.'}
            </div>
            <div className="text-[9px] text-foreground/40">
              Graph history keeps working from this computer's local copy, and pending graphs publish
              automatically once the folder is reachable again.
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
        <div className="flex flex-col">
          <span className="text-[12px] font-medium">Automatic Synchronization</span>
          <span className="text-[10px] text-foreground/40">
            Sync with the shared folder when the Graph Repository is opened
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <div className={cn(
            "w-8 h-4 bg-foreground/20 peer-focus:outline-none rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all",
            "peer-checked:after:translate-x-full peer-checked:after:border-white peer-checked:bg-accent-blue",
          )}></div>
        </label>
      </div>
    </div>
  );
}
