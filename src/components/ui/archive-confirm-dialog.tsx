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
        description: `Are you sure you want to archive "${name}"? It will be hidden from the active list.`,
      };
    case 'unarchive':
      return {
        title: `Unarchive ${name}`,
        description: `Are you sure you want to unarchive "${name}"? It will be restored to the active list.`,
      };
    case 'delete':
      return {
        title: `Delete ${name}`,
        description: `Are you sure you want to permanently delete "${name}"? This action cannot be undone.`,
      };
  }
}

/**
 * Shared confirmation dialog for archive / unarchive / permanent-delete flows.
 * Visual language mirrors the construction portal's archive dialog:
 * - archive → neutral gray (reversible, subtle)
 * - unarchive → restorative blue (distinct from gray archive & red delete)
 * - delete → destructive red
 */
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
  const { title, description } = buildCopy(action, itemName, entityLabel, count);

  // Action-specific confirm button styling.
  const confirmClassName =
    action === 'delete'
      ? 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50'
      : action === 'unarchive'
        ? 'bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50'
        : 'bg-gray-500 text-white hover:bg-gray-600 disabled:opacity-50';

  const confirmLabel =
    action === 'delete' ? 'Delete Permanently' : action === 'unarchive' ? 'Unarchive' : 'Archive';

  // Header icon: archive/unarchive use the neutral gray / blue archive glyphs
  // (matching the row action icons); permanent-delete keeps the red trash.
  const { icon, iconWrapperClassName } =
    action === 'archive'
      ? {
          icon: <Archive className="h-5 w-5 text-gray-600" />,
          iconWrapperClassName: 'bg-gray-100',
        }
      : action === 'unarchive'
        ? {
            icon: <ArchiveRestore className="h-5 w-5 text-blue-800" />,
            iconWrapperClassName: 'bg-blue-100',
          }
        : {
            icon: <Trash2 className="h-5 w-5 text-red-600" />,
            iconWrapperClassName: 'bg-red-100',
          };

  const handleCancel = () => {
    if (!loading) onOpenChange(false);
  };

  const handleConfirm = () => {
    if (!loading) onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[425px] shadow-md gap-2">
        <DialogHeader className="space-y-3">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconWrapperClassName}`}
            >
              {icon}
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg font-semibold text-gray-700">
                {title}
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-500 leading-relaxed mt-1 wrap-break-word">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-3 sm:gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={loading}
            className="text-gray-600 hover:text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={confirmClassName}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
