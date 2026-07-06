'use client';

import React, { type ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** Icon to display. Can be a LucideIcon component or a ReactNode. Defaults to Inbox. */
  icon?: ReactNode | LucideIcon;
  /** Headline text. */
  title?: string;
  /** Supportive description below the title. */
  description?: string;
  /** Action element (e.g. a Button) rendered below description. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const renderIcon = () => {
    if (!icon) {
      return <Inbox className="h-8 w-8 text-primary" />;
    }

    if (React.isValidElement(icon)) {
      return icon;
    }

    const IconComponent = icon as LucideIcon;
    return <IconComponent className="h-8 w-8 text-primary" />;
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-4',
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 shadow-sm mb-4">
        {renderIcon()}
      </div>
      {title && (
        <h3 className="text-base font-semibold text-foreground mb-1">
          {title}
        </h3>
      )}
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
