'use client';

import { InspectionHistory } from '@/components/inspections/inspection-history';
import { PermissionGuard } from '@/components/auth/permission-guard';

export default function InspectionHistoryPage() {
  return (
    <PermissionGuard permission="inspections:inspectionHistory:view">
      <InspectionHistory />
    </PermissionGuard>
  );
}
