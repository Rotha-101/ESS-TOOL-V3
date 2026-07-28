// Decides whether the application shell may render at all.
//
// The rule lives in decideAppState (src/lib/appState.ts), which is pure and
// tested; this component only obeys it. Keeping the decision out of the
// component is why the "activated but offline" case cannot accidentally become
// "show the activation screen again" — the kind of mistake that would look, to
// a user, exactly like losing their work.

import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { decideAppState } from '@/lib/appState';
import { useActivation } from './useActivation';
import { ActivationScreen } from './ActivationScreen';

export function ActivationGate({ children }: { children: React.ReactNode }) {
  const { activation, deviceLabel, busy, error, activate, continueOffline } = useActivation();
  const syncEnabled = useAppStore((s) => s.syncEnabled);
  const phase = useAppStore((s) => s.syncState.phase);
  const theme = useAppStore((s) => s.theme);

  // App applies the theme, but App does not render until this gate lets it —
  // so without this the very first screen a user ever sees is the only one in
  // the wrong theme.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const policy = decideAppState({
    activation,
    syncEnabled,
    phase,
    hasFailures: false,
  });

  if (policy.showShell) return <>{children}</>;

  if (policy.state === 'starting') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 size={22} className="animate-spin text-accent-blue" />
      </div>
    );
  }

  return (
    <ActivationScreen
      deviceLabel={deviceLabel}
      busy={busy}
      error={error || policy.message}
      rejected={policy.state === 'activation_rejected'}
      onActivate={activate}
      onContinueOffline={continueOffline}
    />
  );
}
