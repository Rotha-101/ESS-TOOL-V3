// Switch — an on/off preference that applies immediately.
//
// Replaces ~10 hand-rolled `peer`/`after:` toggles that were copy-pasted across
// the settings screens. Those were div-based, so none of them were reachable by
// keyboard or announced to a screen reader.
//
// Use for settings that take effect at once. For something needing Save, use a
// Checkbox instead — a switch that does not apply immediately is a lie.
//
// Density-aware: sizes derive from --size-control-*, so it scales with the
// user's display-size preference. See docs/DESIGN_SYSTEM.md §3.
//
//   <Switch checked={on} onCheckedChange={setOn} aria-label="Keep in sync" />

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const switchVariants = cva(
  [
    'group/switch relative inline-flex shrink-0 cursor-pointer items-center',
    'rounded-full border border-transparent transition-colors',
    'bg-foreground/20 data-[checked]:bg-accent-blue',
    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ].join(' '),
  {
    variants: {
      size: {
        sm: 'h-4 w-7',
        default: 'h-5 w-9',
        lg: 'h-6 w-11',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

const thumbVariants = cva(
  'pointer-events-none block rounded-full bg-white shadow-sm transition-transform',
  {
    variants: {
      size: {
        sm: 'size-3 translate-x-0.5 data-[checked]:translate-x-3.5',
        default: 'size-4 translate-x-0.5 data-[checked]:translate-x-4.5',
        lg: 'size-5 translate-x-0.5 data-[checked]:translate-x-5.5',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

function Switch({
  className,
  size = 'default',
  ...props
}: SwitchPrimitive.Root.Props & VariantProps<typeof switchVariants>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(switchVariants({ size, className }))}
      {...props}
    >
      <SwitchPrimitive.Thumb className={cn(thumbVariants({ size }))} />
    </SwitchPrimitive.Root>
  );
}

export { Switch, switchVariants };
