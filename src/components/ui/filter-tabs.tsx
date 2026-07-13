'use client';

import { cn } from '@/lib/utils';

export interface FilterTab {
  value: string;
  label: string;
  /** Optional status colour — tints the tab so each filter carries its colour. */
  color?: string;
}

interface FilterTabsProps {
  tabs: FilterTab[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Readable text colour (dark or white) for a solid `hex` background. */
function readableOn(hex: string): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return '#ffffff';
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  // Perceived luminance — dark text on light colours (e.g. amber), white on dark.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1f2937' : '#ffffff';
}

/** Pill-style tab row used to filter list pages by status/category. */
export function FilterTabs({ tabs, value, onChange, className }: FilterTabsProps) {
  return (
    <div className={cn('flex gap-2 flex-wrap', className)}>
      {tabs.map((tab) => {
        const active = value === tab.value;
        // Colour-coded tabs (e.g. work-order statuses): solid status colour when
        // active (readable text), a tint of it with status-coloured text when not.
        const style = tab.color
          ? active
            ? { backgroundColor: tab.color, borderColor: tab.color, color: readableOn(tab.color) }
            : { backgroundColor: `${tab.color}1a`, borderColor: `${tab.color}40`, color: tab.color }
          : undefined;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            style={style}
            className={cn(
              'inline-flex items-center px-3.5 py-1.5 text-sm rounded-full border transition-colors',
              tab.color
                ? active
                  ? 'font-medium shadow-sm'
                  : 'font-medium hover:brightness-95'
                : active
                  ? 'bg-primary text-primary-foreground font-medium border-primary shadow-sm'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground hover:border-muted-foreground/30',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
