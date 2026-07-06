'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Edit,
  Archive,
  CalendarClock,
  Info,
  ClipboardList,
  Truck,
  Bell,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DetailCard, DetailField } from '@/components/ui/detail-field';
import {
  DetailPageHeader,
  DetailPageHeaderSkeleton,
} from '@/components/ui/detail-page-header';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import type { ServiceProgramRow } from './types';

const CALENDAR_UNIT_LABELS: Record<string, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};

export function ServiceProgramDetail() {
  const params = useParams();
  const router = useRouter();
  const [program, setProgram] = useState<ServiceProgramRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Task name lookup map
  const [taskMap, setTaskMap] = useState<Record<string, string>>({});

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const fetchProgram = useCallback(async () => {
    try {
      const res = await axios.get(`/api/service-programs/${params.id}`, { withCredentials: true });
      setProgram(res.data.data);
    } catch {
      setProgram(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  const fetchTaskMap = useCallback(async () => {
    try {
      const res = await axios.get('/api/service-tasks?limit=100', { withCredentials: true });
      const items = res.data.data?.items || [];
      const map: Record<string, string> = {};
      items.forEach((t: Record<string, unknown>) => {
        map[t.id as string] = t.title as string;
      });
      setTaskMap(map);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    if (params.id) {
      fetchProgram();
      fetchTaskMap();
    }
  }, [params.id, fetchProgram, fetchTaskMap]);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await axios.patch(`/api/service-programs/${params.id}/archive`, { archived: true }, { withCredentials: true });
      router.push('/maintenance/service-programs');
    } catch {
      // silent
    } finally {
      setArchiving(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="p-6 max-w-4xl">
        <DetailPageHeaderSkeleton />
      </div>
    );
  }

  // Not found
  if (!program) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Service program not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/maintenance/service-programs')}>
          Back to Service Programs
        </Button>
      </div>
    );
  }

  const iv = program.interval;
  const rm = program.reminders;

  return (
    <div className="p-6 max-w-4xl">
      <DetailPageHeader
        backHref="/maintenance/service-programs"
        backLabel="Back to Service Programs"
        icon={CalendarClock}
        title={program.title}
        badges={
          <Badge variant="secondary" className="text-xs capitalize">
            {iv?.type === 'one_time' ? 'One-time' : 'Repeat'}
          </Badge>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => router.push(`/maintenance/service-programs/${params.id}/edit`)}>
              <Edit className="h-4 w-4" />
              Edit
            </Button>
            <Button variant="secondary" onClick={() => setArchiveDialogOpen(true)}>
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        {/* Details */}
        <DetailCard icon={Info} title="Details" columns={2}>
          <DetailField label="Title" value={program.title} />
          <DetailField label="Program Type" value={iv?.type === 'one_time' ? 'One-time' : 'Repeat'} />
        </DetailCard>

        {/* Service Tasks */}
        <DetailCard icon={ClipboardList} title="Service Tasks" columns={1}>
          {program.serviceTaskIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No service tasks assigned.</p>
          ) : (
            <div className="space-y-2">
              {program.serviceTaskIds.map((taskId) => (
                <div
                  key={taskId}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                >
                  <Badge variant="outline" className="text-xs">Task</Badge>
                  <span className="text-sm text-foreground">
                    {taskMap[taskId] || taskId}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DetailCard>

        {/* Interval */}
        <DetailCard icon={CalendarClock} title="Interval" columns={3}>
          {iv ? (
            iv.type === 'repeat' ? (
              <>
                <DetailField
                  label="Mileage Interval"
                  value={iv.mileage?.enabled && iv.mileage.every > 0 ? `Every ${iv.mileage.every} km` : undefined}
                />
                <DetailField
                  label="Engine Hours Interval"
                  value={iv.engineHours?.enabled && iv.engineHours.every > 0 ? `Every ${iv.engineHours.every} hrs` : undefined}
                />
                <DetailField
                  label="Calendar Interval"
                  value={
                    iv.calendar?.enabled && iv.calendar.every > 0
                      ? `Every ${iv.calendar.every} ${CALENDAR_UNIT_LABELS[iv.calendar.unit] || iv.calendar.unit}${iv.calendar.every !== 1 ? 's' : ''}`
                      : undefined
                  }
                />
                {iv.ends && iv.ends.type !== 'never' && (
                  <DetailField
                    label="Next Due / Ends"
                    value={
                      iv.ends.type === 'on' && iv.ends.date
                        ? `Ends on ${formatDate(iv.ends.date)}`
                        : iv.ends.type === 'after' && iv.ends.occurrences
                          ? `Ends after ${iv.ends.occurrences} occurrences`
                          : iv.ends.type === 'meter_reading' && iv.ends.meterReading
                            ? `Ends at ${iv.ends.meterReading} reading`
                            : undefined
                    }
                  />
                )}
              </>
            ) : (
              <>
                <DetailField
                  label="Target Mileage"
                  value={
                    iv.dueMileage?.enabled && iv.dueMileage.value > 0
                      ? `${iv.dueMileage.mode === 'in' ? 'In' : 'At'} ${iv.dueMileage.value} km`
                      : undefined
                  }
                />
                <DetailField
                  label="Target Engine Hours"
                  value={
                    iv.dueEngineHours?.enabled && iv.dueEngineHours.value > 0
                      ? `${iv.dueEngineHours.mode === 'in' ? 'In' : 'At'} ${iv.dueEngineHours.value} hrs`
                      : undefined
                  }
                />
                <DetailField
                  label="Target Date"
                  value={
                    iv.dueOnDate?.enabled && iv.dueOnDate.date
                      ? formatDate(iv.dueOnDate.date)
                      : undefined
                  }
                />
              </>
            )
          ) : (
            <p className="text-sm text-muted-foreground">No interval configured.</p>
          )}
        </DetailCard>

        {/* Assets */}
        <DetailCard icon={Truck} title="Assets" columns={1}>
          {program.assetIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assets assigned.</p>
          ) : (
            <p className="text-sm font-medium text-foreground">
              {program.assetIds.length} asset{program.assetIds.length !== 1 ? 's' : ''} assigned
            </p>
          )}
        </DetailCard>

        {/* Reminders */}
        <DetailCard icon={Bell} title="Reminders" columns={2}>
          {rm ? (
            <>
              <DetailField
                label="Threshold (Mileage)"
                value={rm.thresholdMileage?.enabled && rm.thresholdMileage.value > 0 ? `${rm.thresholdMileage.value} km before due` : undefined}
              />
              <DetailField
                label="Threshold (Engine Hours)"
                value={rm.thresholdEngineHours?.enabled && rm.thresholdEngineHours.value > 0 ? `${rm.thresholdEngineHours.value} hrs before due` : undefined}
              />
              <DetailField
                label="Threshold (Calendar)"
                value={
                  rm.thresholdCalendar?.enabled && rm.thresholdCalendar.value > 0
                    ? `${rm.thresholdCalendar.value} ${rm.thresholdCalendar.unit}${rm.thresholdCalendar.value !== 1 ? 's' : ''} before due`
                    : undefined
                }
              />
              <DetailField
                label="Auto Create Work Order"
                value={rm.autoCreateWorkOrder ? 'Yes' : 'No'}
              />
              <DetailField
                label="Notification Channels"
                value={rm.channels.length > 0 ? rm.channels.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(', ') : undefined}
              />
              {rm.recipientSelf && (
                <DetailField label="Recipients" value="Myself" />
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No reminders configured.</p>
          )}
        </DetailCard>
      </div>

      {/* Archive dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={program.title}
        action="archive"
        onConfirm={handleArchive}
        loading={archiving}
      />
    </div>
  );
}
