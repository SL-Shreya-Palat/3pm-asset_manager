'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import type { FormItem } from './types';

interface FormSettingsDialogProps {
  form: FormItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defectFieldKeys: Set<string>;
  onDefectFieldKeysChange: (fieldKeys: Set<string>) => void;
}

export function FormSettingsDialog({
  form,
  open,
  onOpenChange,
  defectFieldKeys,
  onDefectFieldKeysChange,
}: FormSettingsDialogProps) {
  const allFields = form?.schema?.pages.flatMap((page) => page.items) || [];

  const handleToggle = (fieldKey: string, checked: boolean) => {
    const next = new Set(defectFieldKeys);
    if (checked) {
      next.add(fieldKey);
    } else {
      next.delete(fieldKey);
    }
    onDefectFieldKeysChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{form?.title || 'Form'} Settings</DialogTitle>
          <DialogDescription>
            View form fields and mark text fields as defect triggers.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          {allFields.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No fields available for this form.
            </p>
          ) : (
            <div className="space-y-1">
              {allFields.map((field) => {
                const isTextType = field.type === 'text' || field.type === 'textarea';
                return (
                  <div
                    key={field.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{field.label}</p>
                      <p className="text-xs text-muted-foreground">{field.type}</p>
                    </div>
                    {isTextType && (
                      <label className="flex items-center gap-2 ml-3 cursor-pointer shrink-0">
                        <Checkbox
                          checked={defectFieldKeys.has(field.fieldKey)}
                          onCheckedChange={(checked) =>
                            handleToggle(field.fieldKey, !!checked)
                          }
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          Mark as Defect
                        </span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
