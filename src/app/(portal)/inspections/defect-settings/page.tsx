'use client';

import { PageHeader } from '@/components/ui/page-header';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { InspectionFormsList } from '@/components/inspections/inspection-forms-list';

export default function DefectSettingsListPage() {
  return (
    <PermissionGuard permission="inspections:defectSettings:view">
      <div className="flex h-full flex-col">
        <PageHeader
          title="Inspection Settings"
          description="Pick a form to set up its inspection rules — which answers flag a defect (asset forms) or flag the driver (driver forms)"
        />

        <div className="flex-1 overflow-auto px-6 pb-8">
          <InspectionFormsList />
        </div>
      </div>
    </PermissionGuard>
  );
}
