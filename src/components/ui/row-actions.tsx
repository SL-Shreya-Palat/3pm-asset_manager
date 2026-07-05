'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from '@/components/ui/button';
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

/** Map label (lowercase) → Button variant for automatic icon-button coloring.
 *  Mirrors the construction portal's registry-driven approach. */
const LABEL_TO_VARIANT: Record<string, ButtonProps['variant']> = {
  view: 'view-icon',
  edit: 'edit-icon',
  delete: 'delete-icon',
  archive: 'archive-icon',
  unarchive: 'unarchive-icon',
  duplicate: 'duplicate-icon',
  receive: 'approve-icon',
  inspect: 'view-icon',
  restore: 'unarchive-icon',
  download: 'download-icon',
  upload: 'upload-icon',
  share: 'share-icon',
};

interface RowActionButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible label — also used as the tooltip title and for auto-variant resolution. */
  label: string;
  icon: React.ReactNode;
  /** Override the auto-resolved Button variant. */
  variant?: ButtonProps['variant'];
  /** @deprecated Use `variant` instead. Kept for backward compatibility. */
  tone?: 'default' | 'primary' | 'destructive';
}

/** A compact icon button for table rows. Resolves its color from the Button
 *  component's icon variants (e.g. `edit-icon`, `delete-icon`) based on the label,
 *  matching the construction portal's approach. */
export const RowActionButton = React.forwardRef<HTMLButtonElement, RowActionButtonProps>(
  ({ label, icon, variant, tone, className, ...props }, ref) => {
    const resolvedVariant =
      variant ?? LABEL_TO_VARIANT[label.trim().toLowerCase()] ?? 'ghost';

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant={resolvedVariant}
            size="icon-sm"
            aria-label={label}
            className={className}
            {...props}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    );
  },
);
RowActionButton.displayName = 'RowActionButton';
