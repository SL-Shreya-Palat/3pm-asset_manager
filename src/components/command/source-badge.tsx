'use client';

/**
 * Shared Command source affordances for master-data lists.
 *
 * `SourceBadge` marks whether a record is mastered in Command (read-only, kept
 * fresh by the auto-sync) or is a local record. `CommandManagedBanner` explains
 * the read-only mode at the top of a connected list.
 */

import { Cable, HardDrive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function SourceBadge({ source }: { source?: string | null }) {
  if (source === 'command') {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-blue-200 bg-blue-50 text-blue-700"
        title="Mastered in Command — refreshes automatically, read-only here"
      >
        <Cable className="h-3 w-3" />
        Command
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <HardDrive className="h-3 w-3" />
      Local
    </Badge>
  );
}

export function CommandManagedBanner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800',
        className,
      )}
    >
      <Cable className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        These records are managed in <strong>Command</strong> while connected — they refresh
        automatically and are read-only here. Add or edit them in Command.
      </span>
    </div>
  );
}

/**
 * Full-page notice for a feature that is NOT available in Asset Manager while
 * connected to Command because Command owns it entirely (e.g. Purchase Orders).
 * Unlike master-data lists (read-only + auto-synced), the feature is hidden.
 */
export function CommandManagedFeatureNotice({ feature }: { feature: string }) {
  return (
    <div className="flex h-full flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-blue-200 bg-blue-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700">
          <Cable className="h-5 w-5" />
        </div>
        <h2 className="mb-1 text-base font-semibold text-blue-900">
          {feature} are managed in Command
        </h2>
        <p className="text-sm text-blue-800">
          While this Asset Manager is connected to Command, {feature.toLowerCase()} are handled in
          Command only. Create and manage them there.
        </p>
      </div>
    </div>
  );
}
