/**
 * Compact KPI ribbon — the shared summary-stat pattern used across list pages
 * (Assets, Dashboard, …). A row of tone-tinted segments divided by hairlines
 * inside a single rounded card. Small by design: an icon chip + value + label.
 *
 * Use `<StatRibbon><StatSeg …/>…</StatRibbon>` instead of hand-rolling a
 * summary row, so every page reads the same.
 */
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export type StatTone =
  | 'primary'
  | 'emerald'
  | 'amber'
  | 'red'
  | 'blue'
  | 'violet'
  | 'sky'
  | 'slate';

const TONE: Record<StatTone, { value: string; icon: string }> = {
  primary: { value: 'text-primary-600', icon: 'bg-primary-100 text-primary-600' },
  emerald: { value: 'text-emerald-600', icon: 'bg-emerald-100 text-emerald-600' },
  amber: { value: 'text-amber-600', icon: 'bg-amber-100 text-amber-600' },
  red: { value: 'text-red-600', icon: 'bg-red-100 text-red-600' },
  blue: { value: 'text-blue-600', icon: 'bg-blue-100 text-blue-600' },
  violet: { value: 'text-violet-600', icon: 'bg-violet-100 text-violet-600' },
  sky: { value: 'text-sky-600', icon: 'bg-sky-100 text-sky-600' },
  slate: { value: 'text-slate-600', icon: 'bg-slate-100 text-slate-600' },
};

/** The bordered, hairline-divided container for a row of `StatSeg`s. */
export function StatRibbon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap divide-x rounded-xl border bg-card shadow-sm', className)}>
      {children}
    </div>
  );
}

interface StatSegProps {
  tone: StatTone;
  icon: LucideIcon;
  label: string;
  value?: React.ReactNode;
  loading?: boolean;
  /** Optional short sub-text under the label (e.g. "expiring soon"). */
  hint?: string;
}

/** One metric segment: tinted icon chip + big value + uppercase label. */
export function StatSeg({ tone, icon: Icon, label, value, loading, hint }: StatSegProps) {
  const t = TONE[tone];
  return (
    <div className="flex min-w-[140px] flex-1 items-center gap-3 px-4 py-3">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4', t.icon)}>
        <Icon />
      </span>
      <div className="min-w-0">
        {loading ? (
          <Skeleton className="h-5 w-8" />
        ) : (
          <p className={cn('text-xl font-bold leading-none tabular-nums', t.value)}>{value ?? 0}</p>
        )}
        <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {hint && !loading && <p className="truncate text-[10px] text-muted-foreground/80">{hint}</p>}
      </div>
    </div>
  );
}
