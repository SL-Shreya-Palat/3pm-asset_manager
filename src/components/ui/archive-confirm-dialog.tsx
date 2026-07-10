'use client';

import { Archive, ArchiveRestore, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ArchiveConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Entity name used to generate default title/description. */
  itemName?: string;
  /** Singular entity label for bulk flows, e.g. "asset", "vendor". */
  entityLabel?: string;
  /**
   * Selected item count for bulk flows. Omit (or pass undefined) for
   * single-row flows — copy switches to "this {entity}" wording.
   */
  count?: number;
  /** Whether archiving, unarchiving, or deleting. */
  action: 'archive' | 'unarchive' | 'delete';
  /** Called when the user confirms. */
  onConfirm: () => void;
  /** Shows spinner and disables buttons. */
  loading?: boolean;
}

function buildCopy(
  action: 'archive' | 'unarchive' | 'delete',
  itemName: string | undefined,
  entityLabel: string | undefined,
  count: number | undefined,
) {
  const isBulk = typeof count === 'number';

  if (isBulk && entityLabel) {
    const label = entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1);
    const subject = `${count} ${label}(s)`;
    const object = `${count} selected ${entityLabel}(s)`;

    switch (action) {
      case 'archive':
        return {
          title: `Archive ${subject}`,
          description: `Are you sure you want to archive ${object}? They will be hidden from the active list.`,
        };
      case 'unarchive':
        return {
          title: `Unarchive ${subject}`,
          description: `Are you sure you want to unarchive ${object}? They will be restored to the active list.`,
        };
      case 'delete':
        return {
          title: `Permanently Delete ${subject}`,
          description: `Are you sure you want to permanently delete ${count} archived ${entityLabel}(s)? This action cannot be undone.`,
        };
    }
  }

  const name = itemName || 'Item';
  switch (action) {
    case 'archive':
      return {
        title: `Archive ${name}`,
        description: `Are you sure you want to archive "${name}"? This item will be moved to the archive.`,
      };
    case 'unarchive':
      return {
        title: `Unarchive ${name}`,
        description: `Are you sure you want to unarchive "${name}"? This item will be restored to the active list.`,
      };
    case 'delete':
      return {
        title: `Delete ${name}`,
        description: `Are you sure you want to permanently delete "${name}"? This action cannot be undone.`,
      };
  }
}

export function ArchiveConfirmDialog({
  open,
  onOpenChange,
  itemName,
  entityLabel,
  count,
  action,
  onConfirm,
  loading = false,
}: ArchiveConfirmDialogProps) {
  const isArchive = action === 'archive';
  const isDelete = action === 'delete';

  const { title, description } = buildCopy(action, itemName, entityLabel, count);

  const handleCancel = () => {
    if (!loading) onOpenChange(false);
  };

  const handleConfirm = () => {
    if (!loading) onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader className="space-y-3">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                isDelete ? 'bg-destructive/10' : isArchive ? 'bg-muted' : 'bg-primary/10'
              }`}
            >
              {isDelete ? (
                <Trash2 className="h-5 w-5 text-destructive" />
              ) : isArchive ? (
                <Archive className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ArchiveRestore className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg font-semibold">
                {title}
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed mt-1">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isDelete ? 'destructive' : isArchive ? 'secondary' : 'default'}
            className={isArchive ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : undefined}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isDelete ? 'Delete' : isArchive ? 'Archive' : 'Unarchive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
