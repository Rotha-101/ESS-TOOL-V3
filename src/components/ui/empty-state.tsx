// EmptyState — nothing here yet, and here is how to change that.
//
// An empty screen with only a message is a dead end. Every empty state offers
// the action that fills it, so "No graphs yet" always comes with a way to make
// one. See docs/DESIGN_SYSTEM.md §8.
//
// Keep the description to one sentence. If it needs a paragraph, the screen
// itself is too hard to understand.
//
//   <EmptyState
//     icon={<Battery />}
//     title="No graphs yet"
//     description="Import your data and generate a graph — it is saved here automatically."
//     action={<Button onClick={goImport}>Import data</Button>}
//   />

import * as React from 'react';
import { cn } from '@/lib/utils';

// `title` is ours — a heading node, not the HTML tooltip attribute.
export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 p-8 text-center select-none',
        className,
      )}
      {...props}
    >
      {icon && (
        // Decorative: the title already says what this is, so announcing the
        // icon would only add noise.
        <div className="text-foreground/20 [&_svg]:size-10" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="space-y-1.5 max-w-sm">
        <div className="text-base font-medium text-foreground/80">{title}</div>
        {description && (
          <p className="text-sm text-foreground/50 leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export { EmptyState };
