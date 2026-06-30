'use client';

import { cn } from '@/lib/utils';

export interface FilterTab {
  value: string;
  label: string;
  /** Optional dot colour (e.g. a work-order status colour). */
  color?: string;
}

interface FilterTabsProps {
  tabs: FilterTab[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Pill-style tab row used to filter list pages by status/category. */
export function FilterTabs({ tabs, value, onChange, className }: FilterTabsProps) {
  return (
    <div className={cn('flex gap-1 flex-wrap', className)}>
      {tabs.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
              active
                ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {tab.color && (
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: tab.color }}
              />
            )}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
