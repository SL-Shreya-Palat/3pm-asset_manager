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
