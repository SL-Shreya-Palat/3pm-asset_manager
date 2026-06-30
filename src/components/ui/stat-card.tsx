import * as React from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Optional leading icon, shown in a tinted chip. */
  icon?: React.ReactNode;
  /** Tailwind text-colour class for the value (e.g. 'text-emerald-600'). Defaults to foreground. */
  accent?: string;
  /** Optional sub-text below the value. */
  hint?: string;
  className?: string;
}

/** Compact metric tile: label + big value with an optional icon chip. The shared
 *  building block for dashboard and analytics summary rows. */
export function StatCard({ label, value, icon, accent, hint, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground truncate">
          {label}
        </p>
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
        )}
      </div>
      <p className={cn('mt-2 text-2xl font-semibold', accent ?? 'text-foreground')}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
