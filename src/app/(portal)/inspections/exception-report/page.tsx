'use client';

import { ExceptionReport } from '@/components/inspections/exception-report';
import { PermissionGuard } from '@/components/auth/permission-guard';

export default function ExceptionReportPage() {
  return (
    <PermissionGuard permission="inspections:exceptionReport:view">
      <ExceptionReport />
    </PermissionGuard>
  );
}
