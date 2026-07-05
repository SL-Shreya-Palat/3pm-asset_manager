'use client';

import { type ReactNode } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog title. Defaults to "Delete {itemName}" */
  title?: string;
  /** Dialog description. Defaults to "Are you sure you want to delete "{itemName}"? This action cannot be undone." */
  description?: string;
  /** Entity name used to generate default title/description. */
  itemName?: string;
  /** Called when the user confirms deletion. */
  onConfirm: () => void;
  /** Shows spinner and disables buttons. */
  loading?: boolean;
  /** Confirm button label. Default: "Delete" */
  confirmLabel?: string;
  /** Custom icon node. Default: Trash2 in red. */
  icon?: ReactNode;
  /** Background class for the icon circle. Default: "bg-destructive/10" */
  iconWrapperClassName?: string;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  onConfirm,
  loading = false,
  confirmLabel,
  icon,
  iconWrapperClassName,
}: DeleteConfirmDialogProps) {
  const dialogTitle = title || `Delete ${itemName || 'Item'}`;
  const dialogDescription =
    description ||
    `Are you sure you want to delete "${itemName || 'this item'}"? This action cannot be undone.`;

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
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                iconWrapperClassName || 'bg-destructive/10',
              )}
            >
              {icon ?? <Trash2 className="h-5 w-5 text-destructive" />}
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg font-semibold">
                {dialogTitle}
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed mt-1">
                {dialogDescription}
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
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel || 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
