import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DetailFieldProps {
  label: string;
  value?: React.ReactNode;
  /** Optional small icon beside the label. */
  icon?: LucideIcon;
  className?: string;
}

/** A single label/value pair for detail/read-only panels. Renders a muted em-dash
 *  when the value is empty so layouts stay aligned. */
export function DetailField({ label, value, icon: Icon, className }: DetailFieldProps) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <p className="text-xs font-medium uppercase tracking-wide truncate">{label}</p>
      </div>
      <p className={cn('mt-1 text-sm break-words', empty ? 'text-muted-foreground/50' : 'font-medium text-foreground')}>
        {empty ? '—' : value}
      </p>
    </div>
  );
}

const COLS = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
} as const;

interface DetailCardProps {
  icon?: LucideIcon;
  title: string;
  /** Optional control aligned to the right of the header. */
  action?: React.ReactNode;
  /** Number of columns in the field grid (responsive). Defaults to 4. */
  columns?: keyof typeof COLS;
  children: React.ReactNode;
  className?: string;
}

/** A titled card (icon chip + title) wrapping a responsive grid of DetailFields. */
export function DetailCard({ icon: Icon, title, action, columns = 4, children, className }: DetailCardProps) {
  return (
    <section className={cn('rounded-xl border bg-card p-5 shadow-sm', className)}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <h2 className="text-sm font-semibold text-foreground truncate">{title}</h2>
        </div>
        {action}
      </div>
      <div className={cn('grid gap-x-4 gap-y-5', COLS[columns])}>{children}</div>
    </section>
  );
}
