'use client';

import { use } from 'react';
import { DefectSettingsPage } from '@/components/inspections/defect-settings-page';

export default function DefectSettingsRoute({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = use(params);
  return <DefectSettingsPage formId={formId} />;
}
