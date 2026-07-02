/**
 * Embedded Widget Builder dashboard — custom widgets section on the home
 * dashboard. Renders an "+ Add Widget" action plus the embedded iframe,
 * with loading and error states. Mirrors construction-portal's dashboard.
 */
'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useWidgetBuilder } from '@/hooks/useWidgetBuilder';

export function DashboardWidgets() {
  const {
    containerRef,
    ready,
    sdkError,
    sessionError,
    openAddModal,
  } = useWidgetBuilder({ dashboardId: 'asset-manager-home' });

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Widgets</h2>
          <p className="text-xs text-muted-foreground">
            Custom reports and charts for your fleet
          </p>
        </div>
        <Button size="sm" onClick={openAddModal} disabled={!ready}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Widget
        </Button>
      </div>

      {sessionError || sdkError ? (
        <div className="border border-border rounded-md bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {sdkError
              ? 'Unable to load Widget Builder. Make sure the Widget Builder service is running.'
              : sessionError}
          </p>
        </div>
      ) : !ready ? (
        <div className="h-[calc(100vh-340px)] min-h-150 border border-border rounded-md bg-card flex items-center justify-center">
          <div className="flex items-center gap-3">
            <Spinner size="sm" />
            <p className="text-sm text-muted-foreground">Loading widgets...</p>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="w-full h-[calc(100vh-340px)] min-h-150 border border-border rounded-md bg-card overflow-hidden"
        />
      )}
    </div>
  );
}
