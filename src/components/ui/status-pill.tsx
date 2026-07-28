// StatusPill — passive, reassuring state.
//
// Status exists to tell someone their work is safe. If nothing is required of
// the user, this must not look like something is wrong: `ok` and `idle` are
// deliberately quiet, and only `warn`/`danger` carry colour weight.
//
// Never colour alone — an icon always accompanies the label. Roughly one man in
// twelve has a colour vision deficiency. See docs/DESIGN_SYSTEM.md §2.8.
//
// Wording belongs to the caller, but must follow §7: "Saved", not "Synced";
// "Working offline", not "Transport unreachable".
//
//   <StatusPill tone="ok" icon={<Check />}>Saved</StatusPill>

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const statusPillVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        ok: 'text-status-ok',
        busy: 'text-status-busy',
        warn: 'text-status-warn',
        danger: 'text-status-danger',
        idle: 'text-foreground/50',
      },
      variant: {
        // Bare text. The default, because a status that is fine should not
        // draw the eye at all.
        plain: '',
        // A filled chip, for when status genuinely needs to be noticed.
        solid: 'px-2 py-0.5 bg-current/10 border border-current/20',
      },
      size: {
        sm: 'text-xs [&_svg]:size-3',
        default: 'text-sm [&_svg]:size-3.5',
      },
    },
    defaultVariants: { tone: 'idle', variant: 'plain', size: 'default' },
  },
);

export interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusPillVariants> {
  icon?: React.ReactNode;
  /** Announce changes to screen readers. On for live status, off for static
   *  labels in a list — a table of 50 announcing rows is unusable. */
  live?: boolean;
}

function StatusPill({
  className,
  tone,
  variant,
  size,
  icon,
  live = false,
  children,
  ...props
}: StatusPillProps) {
  return (
    <span
      data-slot="status-pill"
      className={cn(statusPillVariants({ tone, variant, size, className }))}
      {...(live ? { role: 'status', 'aria-live': 'polite' } : {})}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

export { StatusPill, statusPillVariants };
