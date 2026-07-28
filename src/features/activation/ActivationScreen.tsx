// First launch. The only screen a user sees before they can work.
//
// One field, one button. No server, no key, no repository, no network setting
// — the computer already knows who and where it is, and the endpoint shipped
// with the build. Deliberately larger and quieter than the rest of the app:
// this is the one moment a non-technical user is most likely to feel lost.

import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Monitor, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActivationScreenProps {
  deviceLabel: string;
  busy: boolean;
  error: string;
  rejected: boolean;
  onActivate: (code: string) => void;
  onContinueOffline: () => void;
}

export function ActivationScreen({
  deviceLabel,
  busy,
  error,
  rejected,
  onActivate,
  onContinueOffline,
}: ActivationScreenProps) {
  const [code, setCode] = useState('');

  const submit = () => {
    if (!code.trim() || busy) return;
    onActivate(code);
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[440px]">
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-accent-blue/10 border border-accent-blue/25 flex items-center justify-center mb-4">
            <ShieldCheck size={26} className="text-accent-blue" />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            {rejected ? 'This computer needs to be set up again' : 'Welcome to ESS Toolbox'}
          </h1>
          <p className="text-[13px] text-foreground/55 mt-2 leading-relaxed max-w-[360px]">
            {rejected
              ? 'Your access was changed by your administrator. Enter a new code to continue.'
              : 'Enter the code your administrator gave you. You only need to do this once.'}
          </p>
        </div>

        {/* What is being set up — so the user can see it is their machine */}
        {deviceLabel && (
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg bg-surface border border-border-v mb-4">
            <Monitor size={15} className="text-foreground/40 shrink-0" />
            <span className="text-[12px] text-foreground/70">
              Setting up for <span className="font-medium text-foreground">{deviceLabel}</span>
            </span>
          </div>
        )}

        {/* The one field */}
        <label className="block text-[12px] font-medium text-foreground/80 mb-2">
          Activation code
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Paste your code here"
          autoFocus
          spellCheck={false}
          autoComplete="off"
          disabled={busy}
          className={cn(
            'w-full h-11 px-3.5 rounded-lg bg-surface border text-[13px] font-mono',
            'text-foreground placeholder:text-foreground/30',
            'focus:outline-none focus:ring-2 focus:ring-accent-blue/40 focus:border-accent-blue',
            'disabled:opacity-60',
            error ? 'border-red-500/50' : 'border-border-v',
          )}
        />

        {error && (
          <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-lg bg-red-500/8 border border-red-500/25">
            <AlertTriangle size={14} className="text-red-400 mt-px shrink-0" />
            <span className="text-[12px] text-red-400 leading-relaxed">{error}</span>
          </div>
        )}

        <button
          onClick={submit}
          disabled={!code.trim() || busy}
          className={cn(
            'w-full h-11 mt-4 rounded-lg font-medium text-[13px] flex items-center justify-center gap-2',
            'bg-accent-blue text-white transition-colors',
            'hover:bg-blue-600 disabled:opacity-40 disabled:pointer-events-none',
          )}
        >
          {busy ? (
            <><Loader2 size={15} className="animate-spin" /> Setting up…</>
          ) : (
            <>Continue <ArrowRight size={15} /></>
          )}
        </button>

        {/* Escape hatch. Every analysis tool here is local, so nobody should be
            locked out of their own work by a network or a lost code. */}
        <div className="text-center mt-6 pt-5 border-t border-border-v">
          <button
            onClick={onContinueOffline}
            disabled={busy}
            className="text-[12px] text-foreground/45 hover:text-foreground/75 transition-colors disabled:opacity-40"
          >
            Use this computer without connecting
          </button>
          <p className="text-[11px] text-foreground/30 mt-1.5 leading-relaxed">
            Your work stays on this computer. You can connect later at any time.
          </p>
        </div>
      </div>
    </div>
  );
}
