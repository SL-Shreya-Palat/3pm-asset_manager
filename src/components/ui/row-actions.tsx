'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/** Right-aligned container for a row's action buttons. Stops row-click propagation
 *  so clicking an action never triggers the row's onClick. */
export function RowActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn('flex items-center justify-end gap-0.5', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

const TONE_CLASSES = {
  default: 'text-muted-foreground hover:bg-accent hover:text-foreground',
  primary: 'text-muted-foreground hover:bg-primary/10 hover:text-primary',
  destructive: 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
} as const;

interface RowActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label — also used as the tooltip title. */
  label: string;
  icon: React.ReactNode;
  tone?: keyof typeof TONE_CLASSES;
}

/** A compact icon button for table rows with a tone-tinted hover state. */
export const RowActionButton = React.forwardRef<HTMLButtonElement, RowActionButtonProps>(
  ({ label, icon, tone = 'default', className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md cursor-pointer transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  ),
);
RowActionButton.displayName = 'RowActionButton';
