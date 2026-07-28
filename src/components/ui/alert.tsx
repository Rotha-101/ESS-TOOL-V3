// Alert — something the user should know, in place, that persists.
//
// Chosen over a toast deliberately. A message that disappears is how a sync
// failure stayed invisible long enough to lose a graph; anything worth telling
// someone about is worth leaving on screen until it is resolved.
//
// Every alert states what happened and what to do next — or says that nothing
// is needed. "Unable to connect right now. Your work is saved and will sync
// automatically." See docs/DESIGN_SYSTEM.md §7.
//
//   <Alert tone="warn" title="Working offline">
//     Your work is saved on this computer and will sync automatically.
//   </Alert>

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'flex items-start gap-2.5 rounded-lg border p-3 text-sm [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:mt-0.5',
  {
    variants: {
      tone: {
        info: 'bg-accent-blue/8 border-accent-blue/25 text-foreground [&_svg]:text-status-busy',
        ok: 'bg-status-ok/8 border-status-ok/25 text-foreground [&_svg]:text-status-ok',
        warn: 'bg-status-warn/8 border-status-warn/25 text-foreground [&_svg]:text-status-warn',
        danger: 'bg-status-danger/8 border-status-danger/25 text-foreground [&_svg]:text-status-danger',
      },
    },
    defaultVariants: { tone: 'info' },
  },
);

export interface AlertProps
  // `title` is ours — a heading node, not the HTML tooltip attribute.
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof alertVariants> {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  /** At most one. An alert offering three choices is a dialog. */
  action?: React.ReactNode;
}

function Alert({ className, tone, icon, title, action, children, ...props }: AlertProps) {
  return (
    <div
      data-slot="alert"
      // `alert` interrupts a screen reader; `status` waits for a pause. Only
      // danger earns the interruption.
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(alertVariants({ tone, className }))}
      {...props}
    >
      {icon}
      <div className="flex-1 min-w-0 space-y-1">
        {title && <div className="font-medium leading-snug">{title}</div>}
        {children && (
          <div className="text-foreground/70 leading-relaxed text-xs">{children}</div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export { Alert, alertVariants };
