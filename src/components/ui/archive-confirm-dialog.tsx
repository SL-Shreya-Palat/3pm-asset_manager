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
  /** Whether archiving, unarchiving, or deleting. */
  action: 'archive' | 'unarchive' | 'delete';
  /** Called when the user confirms. */
  onConfirm: () => void;
  /** Shows spinner and disables buttons. */
  loading?: boolean;
}

export function ArchiveConfirmDialog({
  open,
  onOpenChange,
  itemName,
  action,
  onConfirm,
  loading = false,
}: ArchiveConfirmDialogProps) {
  const isArchive = action === 'archive';
  const isDelete = action === 'delete';

  const title = isDelete
    ? `Delete ${itemName || 'Item'}`
    : isArchive
      ? `Archive ${itemName || 'Item'}`
      : `Unarchive ${itemName || 'Item'}`;

  const description = isDelete
    ? `Are you sure you want to permanently delete "${itemName || 'this item'}"? This action cannot be undone.`
    : isArchive
      ? `Are you sure you want to archive "${itemName || 'this item'}"? This item will be moved to the archive.`
      : `Are you sure you want to unarchive "${itemName || 'this item'}"? This item will be restored to the active list.`;

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
