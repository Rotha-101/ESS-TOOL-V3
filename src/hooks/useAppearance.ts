// Applies theme and density to the document root.
//
// One hook rather than an effect inside App, because App is not the only thing
// that renders: the activation screen appears before it. When the theme effect
// lived only in App, the first screen a user ever saw was the only one in the
// wrong colours.
//
// Density sets three CSS variables from which every spacing, typography and
// control-size token derives — see docs/DESIGN_SYSTEM.md §2.1. There is no
// per-mode stylesheet, so adding a fourth mode is three lines of CSS.

import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';

export function useAppearance(): void {
  const theme = useAppStore((s) => s.theme);
  const density = useAppStore((s) => s.density);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
  }, [density]);
}
