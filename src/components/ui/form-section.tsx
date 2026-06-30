import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface FormSectionProps {
  /** Optional leading icon, shown in a tinted chip. */
  icon?: LucideIcon;
  title: string;
  /** Optional one-line hint under the title. */
  description?: string;
  /** Optional control aligned to the right of the header (e.g. an Upload button). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Section header (icon chip + title) with a divider — the shared building block
 * for form and detail panels. Replaces the hand-rolled `<h3> + <Separator>` pattern.
 */
export function FormSection({
  icon: Icon,
  title,
  description,
  action,
  className,
  children,
}: FormSectionProps) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground leading-tight">{title}</h3>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      <Separator className="mb-4" />
      {children}
    </section>
  );
}
