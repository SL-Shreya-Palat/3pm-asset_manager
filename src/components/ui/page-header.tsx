import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  /** Total count shown as a muted suffix, e.g. "Vendors (42)". */
  count?: number;
  /** Optional one-line hint under the title. */
  description?: string;
  /** Right-aligned actions (typically the primary "Create" button). */
  children?: React.ReactNode;
  className?: string;
}

/** Standard list-page header: title + optional count/description on the left, actions on the right. */
export function PageHeader({ title, count, description, children, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4 px-6 pt-6 pb-4', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">
          {title}
          {count !== undefined && (
            <span className="text-muted-foreground font-normal ml-2">({count})</span>
          )}
        </h1>
        {description && <p className="text-sm text-muted-foreground mt-0.5 truncate">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
