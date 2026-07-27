// Settings panel for the shared graph repository service.
//
// Two fields: where the service is, and the access key you were issued. The
// key is handed straight to the main process, which encrypts it with
// safeStorage — it is never held in React state beyond the moment of entry,
// never persisted by the renderer, and cannot be read back.
//
// Test Connection reports the two facts that matter: can we reach the service,
// and may this account publish. Write permission is what makes someone an
// Engineer rather than a Management viewer.

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, Eye, KeyRound, Loader2, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { createTransport, getSyncBridge, type TransportStatus } from '@/lib/sync';

type TestResult = { state: 'idle' | 'testing' | 'done'; status?: TransportStatus };

export function RepositorySettings() {
  const serverUrl = useAppStore((s) => s.serverUrl);
  const setServerUrl = useAppStore((s) => s.setServerUrl);
  const enabled = useAppStore((s) => s.syncEnabled);
  const setEnabled = useAppStore((s) => s.setSyncEnabled);

  const [result, setResult] = useState<TestResult>({ state: 'idle' });
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  const bridge = getSyncBridge();

  useEffect(() => {
    (async () => {
      const res = await bridge?.hasKey();
      setHasKey(Boolean(res?.hasKey));
    })();
  }, [bridge]);

  const handleSaveKey = async () => {
    const value = keyInput.trim();
    if (!value || !bridge) return;
    setSavingKey(true);
    try {
      await bridge.setKey(value);
      // Cleared immediately: the key should not linger in renderer memory or
      // in a React devtools snapshot.
      setKeyInput('');
      setHasKey(true);
      setResult({ state: 'idle' });
    } finally {
      setSavingKey(false);
    }
  };

  const handleClearKey = async () => {
    if (!bridge) return;
    await bridge.clearKey();
    setHasKey(false);
    setResult({ state: 'idle' });
  };

  const handleTest = async () => {
    setResult({ state: 'testing' });
    try {
      const status = await createTransport(serverUrl.trim()).probe();
      setResult({ state: 'done', status });
    } catch (err: any) {
      setResult({
        state: 'done',
        status: { reachable: false, writable: false, error: err?.message ?? String(err) },
      });
    }
  };

  const status = result.status;
  const showOk = result.state === 'done' && status?.reachable && !status?.error;
  const showProblem = result.state === 'done' && (!status?.reachable || Boolean(status?.error));

  return (
    <div className="space-y-4">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2 border-b border-border-v pb-2 flex items-center gap-2">
        <Cloud size={12} /> Graph Repository
      </h3>

      <div className="bg-surface/50 p-3 rounded border border-border-v space-y-3">
        {/* Server */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-medium">Server URL</span>
          <span className="text-[10px] text-foreground/40">
            Where company graph history is synchronized, e.g. https://ess-graphs.example.workers.dev
          </span>
        </div>
        <input
          value={serverUrl}
          onChange={(e) => { setServerUrl(e.target.value); setResult({ state: 'idle' }); }}
          placeholder="https://ess-graphs.example.workers.dev"
          spellCheck={false}
          autoComplete="off"
          className="w-full h-8 px-2 rounded bg-panel border border-border-v text-[11px] font-mono text-foreground/90 placeholder:text-foreground/25 focus:outline-none focus:border-accent-blue"
        />

        {/* Access key */}
        <div className="flex flex-col gap-0.5 pt-1">
          <span className="text-[12px] font-medium flex items-center gap-1.5">
            <KeyRound size={11} /> Access Key
          </span>
          <span className="text-[10px] text-foreground/40">
            Issued by your administrator. Stored encrypted on this computer and never shown again.
          </span>
        </div>

        {hasKey ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-8 px-2 rounded bg-panel border border-emerald-500/30 flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
              <CheckCircle2 size={12} /> A key is stored on this computer
            </div>
            <button
              onClick={handleClearKey}
              className="h-8 px-2.5 text-[10px] font-bold rounded bg-red-600/80 hover:bg-red-500 text-white flex items-center gap-1.5 shrink-0"
              title="Remove the stored key from this computer"
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveKey(); }}
              placeholder="Paste your access key"
              type="password"
              spellCheck={false}
              autoComplete="off"
              className="flex-1 h-8 px-2 rounded bg-panel border border-border-v text-[11px] font-mono text-foreground/90 placeholder:text-foreground/25 focus:outline-none focus:border-accent-blue"
            />
            <button
              onClick={handleSaveKey}
              disabled={!keyInput.trim() || savingKey || !bridge}
              className="h-8 px-2.5 text-[10px] font-bold rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:pointer-events-none"
            >
              {savingKey ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />} Save Key
            </button>
          </div>
        )}

        <button
          onClick={handleTest}
          disabled={!serverUrl.trim() || result.state === 'testing'}
          className="w-full h-8 px-2.5 text-[10px] font-bold rounded bg-accent-blue hover:bg-blue-600 text-white flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
        >
          {result.state === 'testing' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          Test Connection
        </button>

        {showOk && (
          <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
              <CheckCircle2 size={12} /> Connected{status?.userName ? ` as ${status.userName}` : ''}
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
              {status?.error || 'The server could not be reached.'}
            </div>
            <div className="text-[9px] text-foreground/40">
              Graph history keeps working from this computer's local copy, and pending graphs publish
              automatically once the server is reachable again.
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between bg-surface/50 p-3 rounded border border-border-v">
        <div className="flex flex-col">
          <span className="text-[12px] font-medium">Automatic Synchronization</span>
          <span className="text-[10px] text-foreground/40">
            Keep this computer's history in step with the company repository
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <div className={cn(
            "w-8 h-4 bg-foreground/20 peer-focus:outline-none rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all",
            'peer-checked:after:translate-x-full peer-checked:after:border-white peer-checked:bg-accent-blue',
          )}></div>
        </label>
      </div>
    </div>
  );
}
