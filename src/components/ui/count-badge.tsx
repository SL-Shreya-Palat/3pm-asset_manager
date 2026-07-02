'use client';

import { cn } from '@/lib/utils';

export type CountBadgeVariant =
  | 'primary'
  | 'blue'
  | 'amber'
  | 'emerald'
  | 'violet'
  | 'rose'
  | 'destructive'
  | 'muted'
  | 'slate';

const VARIANT_STYLES: Record<CountBadgeVariant, string> = {
  primary: 'bg-primary text-primary-foreground',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  destructive: 'bg-destructive/15 text-destructive dark:bg-destructive/20',
  muted: 'bg-muted text-muted-foreground',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

interface CountBadgeProps {
  count: number;
  /** When set, shows "label count" (e.g. "Total 12") */
  label?: string;
  variant?: CountBadgeVariant;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function CountBadge({ count, label, variant = 'primary', className, size = 'md' }: CountBadgeProps) {
  const sizeClass =
    size === 'sm'
      ? 'h-6 min-h-6 px-2.5 text-xs'
      : size === 'lg'
        ? 'min-w-[28px] h-7 px-2.5 text-sm'
        : 'min-w-[24px] h-6 px-2 text-xs';

  const withLabel = label != null && label !== '';
  const minWidthClass = withLabel
    ? ''
    : size === 'sm'
      ? 'min-w-[20px]'
      : size === 'lg'
        ? 'min-w-[28px]'
        : 'min-w-[24px]';

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-bold tabular-nums',
        VARIANT_STYLES[variant],
        sizeClass,
        minWidthClass,
        className,
      )}
    >
      {withLabel && <span className="font-medium opacity-90">{label}</span>}
      <span>{count}</span>
    </span>
  );
}
