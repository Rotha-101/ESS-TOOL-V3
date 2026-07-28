// Label — a real <label>, associated with its control.
//
// Adjacent text is not a label: a screen reader user tabbing to an input needs
// to be told what it is, and clicking the text should focus the field. Several
// settings rows in this codebase used a bare <span>, which does neither.
//
//   <Label htmlFor="code">Activation code</Label>
//   <Input id="code" />

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** Marks the field as required, visually and to assistive technology. */
  required?: boolean;
}

function Label({ className, required, children, ...props }: LabelProps) {
  return (
    <label
      data-slot="label"
      className={cn(
        'text-sm font-medium text-foreground/85 select-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="text-status-danger ml-0.5" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

export { Label };
