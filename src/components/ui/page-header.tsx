import * as React from 'react';
import { cn } from '@/lib/utils';
import { CountBadge } from '@/components/ui/count-badge';

interface PageHeaderProps {
  title: string;
  /** Total count shown as a badge next to the title. */
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
    <div
      className={cn(
        'flex flex-col items-start gap-3 px-4 pt-6 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6',
        className,
      )}
    >
      <div className="min-w-0 max-w-full">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground truncate sm:text-2xl">
            {title}
          </h1>
          {count !== undefined && (
            <CountBadge count={count} variant="primary" size="md" />
          )}
        </div>
        {description && <p className="text-sm text-muted-foreground mt-0.5 truncate">{description}</p>}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2 shrink-0 max-sm:w-full">{children}</div>
      )}
    </div>
  );
}
