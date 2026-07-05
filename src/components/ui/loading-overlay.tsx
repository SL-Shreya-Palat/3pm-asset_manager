'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LoadingOverlayProps {
  /** Caption under the spinner. Default: "Loading" */
  label?: string;
  className?: string;
}

/**
 * Minimal loading overlay — renders a spinner + label centered over
 * its nearest positioned ancestor. The parent must have `position: relative`.
 */
export function LoadingOverlay({
  label = 'Loading',
  className,
}: LoadingOverlayProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 z-10 flex flex-col items-center justify-center',
        'bg-background/60 pointer-events-none',
        className,
      )}
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <Loader2 className="h-5 w-5 animate-spin text-primary" strokeWidth={2} />
      <span className="mt-2 text-sm font-medium text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
