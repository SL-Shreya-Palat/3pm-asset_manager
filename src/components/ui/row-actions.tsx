'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/** Right-aligned container for a row's action buttons. Stops row-click propagation
 *  so clicking an action never triggers the row's onClick. */
export function RowActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn('flex items-center justify-end gap-0.5', className)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </TooltipProvider>
  );
}

/** Tone → always-on colored pill (colored icon + soft tinted background). */
const TONE_CLASSES = {
  default: 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800',
  primary: 'bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900/50',
  destructive: 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/50',
} as const;

/** Per-action color (by label) so each action is a distinct colored chip regardless
 *  of the tone the caller passed. Unmapped labels fall back to TONE_CLASSES. */
const ACTION_COLORS: Record<string, string> = {
  view: 'bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900/50',
  edit: 'bg-amber-100 text-amber-600 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-900/50',
  duplicate: 'bg-violet-100 text-violet-600 hover:bg-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:hover:bg-violet-900/50',
  receive: 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/50',
  restore: 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/50',
  archive: 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800',
  delete: 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/50',
};

interface RowActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label — also used as the tooltip title. */
  label: string;
  icon: React.ReactNode;
  tone?: keyof typeof TONE_CLASSES;
}

/** A compact icon button for table rows with a tone-tinted hover state. */
export const RowActionButton = React.forwardRef<HTMLButtonElement, RowActionButtonProps>(
  ({ label, icon, tone = 'default', className, ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md cursor-pointer transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            'disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4',
            ACTION_COLORS[label.trim().toLowerCase()] ?? TONE_CLASSES[tone],
            className,
          )}
          {...props}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  ),
);
RowActionButton.displayName = 'RowActionButton';
