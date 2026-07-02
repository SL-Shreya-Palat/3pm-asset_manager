'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { InventorySettingsList, type SettingsFieldConfig } from '@/components/settings/inventory-settings-list';

const ASSET_TYPE_FIELDS: SettingsFieldConfig[] = [
  { key: 'name', label: 'Asset type name', type: 'text', required: true, placeholder: 'e.g. Vehicle' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description' },
];

interface AssetTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTypeCreated?: () => void;
}

export function AssetTypeDialog({ open, onOpenChange, onTypeCreated }: AssetTypeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Asset Types</DialogTitle>
          <DialogDescription>Add, edit, or remove asset types.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <InventorySettingsList
            title="Asset Types"
            apiEndpoint="/api/inventory-settings/asset-types"
            fields={ASSET_TYPE_FIELDS}
            createLabel="Add Asset Type"
            onDataChange={onTypeCreated}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
