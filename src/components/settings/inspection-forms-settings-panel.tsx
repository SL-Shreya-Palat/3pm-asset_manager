'use client';

/**
 * Admin Settings → Inspections → Forms Inspection.
 *
 * Lists the tenant's forms so a manager can pick one and configure which
 * answers flag a defect (asset forms) or flag the driver (driver forms).
 * Previously surfaced in the main sidebar as "Inspection Settings"; moved here
 * and renamed "Forms Inspection". The per-form config still lives at
 * /inspections/forms/[formId]/defect-settings, reached via the form cards.
 */
import { FileCheck2 } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { InspectionFormsList } from '@/components/inspections/inspection-forms-list';

export function InspectionFormsSettingsPanel() {
  return (
    <PermissionGuard permission="inspections:defectSettings:view">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileCheck2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Forms Inspection</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Pick a form to set up its inspection rules — which answers flag a defect
          (asset forms) or flag the driver (driver forms).
        </p>
        <InspectionFormsList />
      </div>
    </PermissionGuard>
  );
}
