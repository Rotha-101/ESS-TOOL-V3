// The navigation rail.
//
// Renders from src/config/navigation.ts. Previously this was ten hand-written
// NavItem elements wrapped in a `{!readOnly && (...)}` fragment, which meant the
// role rule lived in JSX and adding an item meant editing markup.
//
// Keyboard: arrow keys move between items, Home/End jump to the ends, and the
// whole rail is one tab stop — so a keyboard user reaches the content in two
// presses rather than eleven. Follows the ARIA authoring practice for a
// vertical toolbar.

import React, { useCallback, useRef } from 'react';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, visibleNavItems, type NavItemConfig } from '@/config/navigation';

export interface AppSidebarProps {
  activeTab: string;
  onNavigate: (id: string) => void;
  onOpenSettings: () => void;
  readOnly: boolean;
  role?: string | null;
  /** Called on hover/focus so the target module can start loading before the
   *  click lands. */
  onIntent?: (id: string) => void;
}

export function AppSidebar({
  activeTab,
  onNavigate,
  onOpenSettings,
  readOnly,
  role,
  onIntent,
}: AppSidebarProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const items = visibleNavItems({ readOnly, role });

  // Roving focus. Only the active item is tabbable, so Tab enters and leaves
  // the rail once instead of stopping at every module.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;

    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[data-nav-item]') ?? [],
    );
    if (!buttons.length) return;

    const current = buttons.findIndex((b) => b === document.activeElement);
    let next = current;
    if (e.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % buttons.length;
    if (e.key === 'ArrowUp') next = current <= 0 ? buttons.length - 1 : current - 1;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = buttons.length - 1;

    e.preventDefault();
    buttons[next]?.focus();
  }, []);

  return (
    <nav
      aria-label="Main"
      className="w-[var(--size-sidebar)] shrink-0 bg-panel border-r border-border-v flex flex-col justify-between"
      style={{ width: 'var(--size-sidebar)' }}
    >
      <div ref={listRef} onKeyDown={onKeyDown} className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.group === group.id);
          if (!groupItems.length) return null;

          return (
            <div key={group.id} className="mb-1" role="group" aria-labelledby={`nav-${group.id}`}>
              {group.label && (
                <div
                  id={`nav-${group.id}`}
                  className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-foreground/35 select-none"
                >
                  {group.label}
                </div>
              )}
              {groupItems.map((item) => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  active={activeTab === item.id}
                  onSelect={() => onNavigate(item.id)}
                  onIntent={() => onIntent?.(item.id)}
                />
              ))}
            </div>
          );
        })}
      </div>

      <div className="p-2 border-t border-border-v">
        <button
          onClick={onOpenSettings}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 rounded-md text-sm text-left transition-colors',
            'h-[var(--size-control-md)] text-foreground/60 hover:text-foreground hover:bg-foreground/5',
          )}
        >
          <Settings className="size-4 shrink-0" aria-hidden="true" />
          Settings
        </button>
      </div>
    </nav>
  );
}

function SidebarItem({
  item,
  active,
  onSelect,
  onIntent,
}: {
  item: NavItemConfig;
  active: boolean;
  onSelect: () => void;
  onIntent: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      data-nav-item
      // Roving tabindex: the rail is a single tab stop.
      tabIndex={active ? 0 : -1}
      aria-current={active ? 'page' : undefined}
      onClick={onSelect}
      onMouseEnter={onIntent}
      onFocus={onIntent}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 text-sm text-left transition-colors relative',
        'h-[var(--size-control-md)]',
        active
          ? 'bg-accent-blue/10 text-foreground font-medium'
          : 'text-foreground/60 hover:text-foreground hover:bg-foreground/5',
      )}
    >
      {active && (
        <span
          className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-accent-blue"
          aria-hidden="true"
        />
      )}
      <Icon
        className={cn('size-4 shrink-0', active ? 'text-accent-blue' : 'opacity-70')}
        aria-hidden="true"
      />
      <span className="truncate">{item.label}</span>
    </button>
  );
}
