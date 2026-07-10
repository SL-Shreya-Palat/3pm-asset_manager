import * as React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Optional leading icon, shown in a tinted chip. */
  icon?: React.ReactNode;
  /** Tailwind text-colour class for the value (e.g. 'text-emerald-600'). Defaults to foreground. */
  accent?: string;
  /** Optional sub-text below the value. */
  hint?: string;
  /** Show skeleton loading state. */
  loading?: boolean;
  className?: string;
}

/** Compact metric tile: label + big value with an optional icon chip. The shared
 *  building block for dashboard and analytics summary rows. On phones/narrow
 *  PWA windows the tile shrinks further and drops the icon chip so a row of
 *  4 stats doesn't dominate the screen. */
export function StatCard({ label, value, icon, accent, hint, loading, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-sm border bg-card p-2.5 shadow-sm transition-shadow hover:shadow sm:p-4',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
          {label}
        </p>
        {icon && (
          <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4 sm:flex">
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-1 h-5 w-14 sm:mt-2 sm:h-8 sm:w-20" />
      ) : (
        <p className={cn('mt-1 truncate text-base font-semibold sm:mt-2 sm:text-2xl', accent ?? 'text-foreground')}>
          {value}
        </p>
      )}
      {hint && !loading && (
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">{hint}</p>
      )}
    </div>
  );
}
