'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageBackButton } from '@/components/ui/page-back-button';
import { cn } from '@/lib/utils';

interface DetailPageHeaderProps {
  /** Route to navigate back to (e.g. "/people/roles"). */
  backHref: string;
  /** Label for the back button (kept for accessibility / aria, not rendered visually). */
  backLabel: string;
  /** Hero icon shown in the tinted chip. */
  icon: LucideIcon;
  /** Optional Tailwind classes for the icon chip (defaults to primary tint). */
  iconClassName?: string;
  /** Primary title. */
  title: string;
  /** Optional second-line content (number, type, etc.). */
  subtitle?: React.ReactNode;
  /** Inline badges rendered beside the title. */
  badges?: React.ReactNode;
  /** Right-aligned action buttons. */
  actions?: React.ReactNode;
}

/**
 * Reusable hero header for entity detail pages.
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────────────────────┐
 * │ (←) [Icon]  Title  [badges]          [actions...]   │
 * │             subtitle                                │
 * └─────────────────────────────────────────────────────┘
 * ```
 */
export function DetailPageHeader({
  backHref,
  backLabel,
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  badges,
  actions,
}: DetailPageHeaderProps) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: back button + icon + title */}
        <div className="flex items-center gap-4 min-w-0">
          <PageBackButton href={backHref} aria-label={backLabel} />
          <div
            className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary',
              iconClassName,
            )}
          >
            <Icon className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              {badges}
            </div>
            {subtitle && (
              <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
            )}
          </div>
        </div>

        {/* Right: actions */}
        {actions && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>
        )}
      </div>
    </div>
  );
}

/** Skeleton placeholder while the detail page is loading. */
export function DetailPageHeaderSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm mb-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-14 w-14 rounded-xl" />
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-24 mt-1.5" />
        </div>
      </div>
    </div>
  );
}
