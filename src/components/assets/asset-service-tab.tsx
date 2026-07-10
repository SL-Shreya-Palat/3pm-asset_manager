'use client';

/**
 * Asset Service tab — hierarchical servicing status + history (mirrors Command).
 *
 * Shows the asset's assigned Service Plan and each schedule's due-status from the
 * ported engine (calc.ts). Servicing a higher-order schedule in a group also
 * completes the lower ones — surfaced via the "also completes" hint. Log Service
 * records which schedule was serviced (drives the group reset).
 */
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Wrench, AlertTriangle, Clock, CheckCircle2, Plus, History, Gauge, User, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ui/date-field';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { MeterTypeSelect } from '@/components/maintenance/service-fields';
import { cn } from '@/lib/utils';
import {
  SERVICE_STATUS_VARIANT,
  SERVICE_STATUS_LABEL,
  SERVICE_STATUS_TEXT,
  type ServiceScheduleStatus,
} from '@/constants/service-status';

type SchedStatus = ServiceScheduleStatus;

interface ScheduleStatus {
  scheduleId: string;
  scheduleName: string;
  unit: string;
  value: number | null;
  status: SchedStatus;
  interval: number;
  nextServiceAt: number | null;
  nextCalendarDate: string | null;
  lastServicedAt: string | null;
  serviceGroup: number | null;
  completedSchedules: string[];
}
interface HistoryEntry {
  id: string;
  taskNames: string[];
  servicePlanScheduleName?: string | null;
  performedAt: string | null;
  meterType: string | null;
  meterAtService: number | null;
  totalCost: number | null;
  performedByName: string | null;
  notes: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AssetServiceTab({ assetId }: { assetId: string }) {
  const [planName, setPlanName] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ScheduleStatus[]>([]);
  const [summary, setSummary] = useState({ overdue: 0, due: 0, upcoming: 0, planned: 0 });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [preselect, setPreselect] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/assets/${assetId}/service-status`, { withCredentials: true });
      const data = res.data.data;
      setPlanName(data?.planName ?? null);
      setPlanId(data?.planId ?? null);
      setSchedules(data?.schedules ?? []);
      setSummary(data?.summary ?? { overdue: 0, due: 0, upcoming: 0, planned: 0 });
      setHistory(data?.history ?? []);
    } catch {
      setSchedules([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    const t = setTimeout(() => fetchStatus(), 0);
    return () => clearTimeout(t);
  }, [fetchStatus]);

  const openLog = (scheduleId: string | null) => { setPreselect(scheduleId); setLogOpen(true); };
  const handleLogged = () => { setLogOpen(false); setPreselect(null); fetchStatus(); };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Overdue" value={summary.overdue} accent="text-destructive" />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Due" value={summary.due} accent="text-yellow-600" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Upcoming" value={summary.upcoming} accent="text-gray-500" />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Service schedule{planName ? ` — ${planName}` : ''}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Next service due per schedule. Same group + higher order resets the lower schedules.
          </p>
        </div>
        <Button size="sm" onClick={() => openLog(null)} disabled={!planId}>
          <Plus className="h-4 w-4" /> Log Service
        </Button>
      </div>

      {schedules.length === 0 ? (
        <div className="mb-8 rounded-xl border border-dashed border-border p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Wrench className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No service plan assigned</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Assign a plan from Maintenance → Service Plans (or the asset edit form) to track servicing.
          </p>
        </div>
      ) : (
        <div className="mb-8 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">Schedule</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Next Service Date</th>
                <th className="px-4 py-2.5">Next Service Value</th>
                <th className="px-4 py-2.5">Value Till Next Service</th>
                <th className="px-4 py-2.5">Last Serviced At</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => {
                // Same columns/format as Command's Upcoming Services table.
                const nextServiceValue = s.nextServiceAt ?? s.interval;
                // Calendar schedules (Days/Months) measure "till next" in days.
                const valueUnit = s.unit === 'Months' || s.unit === 'Days' ? 'Days' : s.unit;
                return (
                  <tr key={s.scheduleId} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-foreground">{s.scheduleName}</span>
                      {s.completedSchedules.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          also completes: {s.completedSchedules.join(', ')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={SERVICE_STATUS_VARIANT[s.status]}>{SERVICE_STATUS_LABEL[s.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">{formatDate(s.nextCalendarDate)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {nextServiceValue != null ? (
                        <span className="inline-flex rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground">
                          {Number(nextServiceValue).toLocaleString()} {s.unit}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.value != null ? (
                        <span className={cn('text-sm font-semibold', SERVICE_STATUS_TEXT[s.status])}>
                          {Number(s.value).toFixed(2)} {valueUnit}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">{formatDate(s.lastServicedAt)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-base font-semibold text-foreground">Service History</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {history.length}
        </span>
      </div>
      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <History className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No services logged yet.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {history.map((h) => {
            const label =
              h.servicePlanScheduleName ||
              h.taskNames.filter(Boolean).join(', ') ||
              'Service';
            return (
              <div key={h.id} className="flex gap-3.5 rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Wrench className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{label}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" /> {formatDate(h.performedAt)}
                      </p>
                    </div>
                    {h.totalCost != null && (
                      <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-sm font-semibold tabular-nums text-foreground">
                        ${h.totalCost.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {h.meterAtService != null && (
                      <span className="inline-flex items-center gap-1">
                        <Gauge className="h-3 w-3" />
                        {h.meterAtService.toLocaleString()} {h.meterType === 'engine_hours' ? 'hrs' : 'km'}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {h.performedByName || 'Unknown'}
                    </span>
                  </div>
                  {h.notes && (
                    <p className="mt-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs italic text-muted-foreground">
                      {h.notes}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {logOpen && planId && (
        <LogServiceDialog
          key={preselect ?? '__all__'}
          assetId={assetId}
          planId={planId}
          schedules={schedules}
          preselect={preselect}
          onClose={() => { setLogOpen(false); setPreselect(null); }}
          onLogged={handleLogged}
        />
      )}
    </div>
  );
}

function LogServiceDialog({
  assetId, planId, schedules, preselect, onClose, onLogged,
}: {
  assetId: string;
  planId: string;
  schedules: ScheduleStatus[];
  preselect: string | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [scheduleId, setScheduleId] = useState<string>(
    preselect || schedules[0]?.scheduleId || '',
  );
  const [performedAt, setPerformedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [meterType, setMeterType] = useState('odometer');
  const [meter, setMeter] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selected = schedules.find((s) => s.scheduleId === scheduleId);

  const handleSubmit = async () => {
    setError('');
    if (!scheduleId) { setError('Select a schedule'); return; }
    try {
      setSaving(true);
      await axios.post(`/api/assets/${assetId}/service-entries`, {
        servicePlanId: planId,
        servicePlanSchedule: scheduleId,
        performedAt: performedAt || undefined,
        meterType,
        meterAtService: meter ? parseFloat(meter) : undefined,
        totalCost: totalCost ? parseFloat(totalCost) : undefined,
        notes: notes.trim() || undefined,
      }, { withCredentials: true });
      onLogged();
    } catch {
      setError('Failed to log service');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Log Service</DialogTitle>
          <DialogDescription>
            Record a completed service. Servicing a higher-order schedule also resets the lower
            ones in its group.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          <div>
            <Label>Schedule serviced</Label>
            <select
              value={scheduleId}
              onChange={(e) => setScheduleId(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {schedules.map((s) => (
                <option key={s.scheduleId} value={s.scheduleId}>
                  {s.scheduleName} (G{s.serviceGroup ?? '-'})
                </option>
              ))}
            </select>
            {selected && selected.completedSchedules.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Also completes: {selected.completedSchedules.join(', ')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <DateField id="svcDate" label="Date" value={performedAt} onChange={setPerformedAt} placeholder="Select date" />
            </div>
            <div>
              <Label>Meter type</Label>
              <MeterTypeSelect value={meterType} onChange={setMeterType} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="svcMeter">Meter reading</Label>
              <Input id="svcMeter" type="number" min="0" value={meter} onChange={(e) => setMeter(e.target.value)} placeholder="e.g. 50000" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="svcCost">Total cost</Label>
              <Input id="svcCost" type="number" min="0" step="0.01" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} placeholder="0.00" className="mt-1.5" />
            </div>
          </div>

          <div>
            <Label htmlFor="svcNotes">Notes</Label>
            <Textarea id="svcNotes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1.5" placeholder="Optional notes..." />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : 'Log Service'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
