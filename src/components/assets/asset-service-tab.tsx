'use client';

/**
 * Asset Service tab — preventative-maintenance status + history.
 * Lists each service program assigned to the asset with its computed due-status,
 * lets the user Log a completed service (which resets the schedule), and shows
 * recent service history. Mirrors the Fuel tab pattern.
 */
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Wrench, AlertTriangle, Clock, CheckCircle2, Plus, History, Gauge, User, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { MeterTypeSelect, ProgramChecklist } from '@/components/maintenance/service-fields';
import { cn } from '@/lib/utils';

type ServiceStatus = 'ok' | 'due_soon' | 'overdue' | 'unknown';

interface TriggerStatus { triggerType: string; status: ServiceStatus; label: string; remaining: number | null }
interface ProgramStatus {
  programId: string;
  title: string;
  category: string;
  status: ServiceStatus;
  triggers: TriggerStatus[];
  serviceTaskIds: string[];
  lastPerformedAt: string | null;
}
interface HistoryEntry {
  id: string;
  programNames: string[];
  taskNames: string[];
  performedAt: string | null;
  meterType: string | null;
  meterAtService: number | null;
  totalCost: number | null;
  performedByName: string | null;
  notes: string | null;
}

const STATUS_META: Record<ServiceStatus, { label: string; className: string }> = {
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  due_soon: { label: 'Due soon', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
  ok: { label: 'OK', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  unknown: { label: 'No data', className: 'bg-muted text-muted-foreground hover:bg-muted' },
};

/** Per-status icon + accent for the program cards. */
const STATUS_CONFIG: Record<ServiceStatus, { icon: typeof Wrench; wrap: string; border: string }> = {
  overdue: { icon: AlertTriangle, wrap: 'bg-red-100 text-red-600', border: 'border-red-200' },
  due_soon: { icon: Clock, wrap: 'bg-amber-100 text-amber-600', border: 'border-amber-200' },
  ok: { icon: CheckCircle2, wrap: 'bg-emerald-100 text-emerald-600', border: 'border-border' },
  unknown: { icon: Wrench, wrap: 'bg-muted text-muted-foreground', border: 'border-border' },
};

/** Per-trigger chip styling by that condition's status. */
const TRIGGER_CONFIG: Record<ServiceStatus, string> = {
  overdue: 'border-red-200 bg-red-50 text-red-700',
  due_soon: 'border-amber-200 bg-amber-50 text-amber-700',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  unknown: 'border-border bg-muted text-muted-foreground',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AssetServiceTab({ assetId }: { assetId: string }) {
  const [programs, setPrograms] = useState<ProgramStatus[]>([]);
  const [summary, setSummary] = useState({ overdue: 0, dueSoon: 0, ok: 0 });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [logOpen, setLogOpen] = useState(false);
  const [preselect, setPreselect] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/assets/${assetId}/service-status`, { withCredentials: true });
      const data = res.data.data;
      setPrograms(data?.programs ?? []);
      setSummary(data?.summary ?? { overdue: 0, dueSoon: 0, ok: 0 });
      setHistory(data?.history ?? []);
    } catch {
      setPrograms([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  // Defer so setState isn't called synchronously inside the effect body.
  useEffect(() => {
    const t = setTimeout(() => fetchStatus(), 0);
    return () => clearTimeout(t);
  }, [fetchStatus]);

  const openLog = (programId: string | null) => { setPreselect(programId); setLogOpen(true); };
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
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Overdue" value={summary.overdue} accent="text-red-600" />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Due soon" value={summary.dueSoon} accent="text-amber-600" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Up to date" value={summary.ok} accent="text-emerald-600" />
      </div>

      {/* Programs */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Service Schedule</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Preventive maintenance due on this asset</p>
        </div>
        <Button size="sm" onClick={() => openLog(null)}>
          <Plus className="h-4 w-4" /> Log Service
        </Button>
      </div>

      {programs.length === 0 ? (
        <div className="mb-8 rounded-xl border border-dashed border-border p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Wrench className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No service programs assigned</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Assign one from Maintenance → Service Programs to start tracking due dates.
          </p>
        </div>
      ) : (
        <div className="mb-8 space-y-2.5">
          {programs.map((p) => {
            const meta = STATUS_CONFIG[p.status];
            const Icon = meta.icon;
            const urgent = p.status === 'overdue' || p.status === 'due_soon';
            return (
              <div
                key={p.programId}
                className={cn(
                  'flex items-center gap-4 rounded-xl border bg-card px-4 py-3.5 shadow-sm',
                  meta.border,
                )}
              >
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', meta.wrap)}>
                  <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{p.title}</span>
                    <Badge className={STATUS_META[p.status].className}>{STATUS_META[p.status].label}</Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.triggers.map((t, i) => (
                      <span
                        key={i}
                        className={cn(
                          'inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium',
                          TRIGGER_CONFIG[t.status],
                        )}
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Last performed: <span className="text-foreground/80">{formatDate(p.lastPerformedAt)}</span>
                  </p>
                </div>

                <Button
                  variant={urgent ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => openLog(p.programId)}
                  className="shrink-0"
                >
                  Log
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* History */}
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
            const label = [...h.programNames, ...h.taskNames].filter(Boolean).join(', ') || 'Service';
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
                        {h.meterAtService.toLocaleString()} {h.meterType === 'engine_hours' ? 'hrs' : 'mi/km'}
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

      {logOpen && (
        <LogServiceDialog
          key={preselect ?? '__all__'}
          assetId={assetId}
          programs={programs}
          preselect={preselect}
          onClose={() => { setLogOpen(false); setPreselect(null); }}
          onLogged={handleLogged}
        />
      )}
    </div>
  );
}

function LogServiceDialog({
  assetId, programs, preselect, onClose, onLogged,
}: {
  assetId: string;
  programs: ProgramStatus[];
  preselect: string | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  // Mounted fresh per open (via `key`), so initial state comes from props —
  // no reset effect needed.
  const [selected, setSelected] = useState<Set<string>>(() =>
    preselect
      ? new Set([preselect])
      : new Set(programs.filter((p) => p.status === 'overdue' || p.status === 'due_soon').map((p) => p.programId)),
  );
  const [performedAt, setPerformedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [meterType, setMeterType] = useState('odometer');
  const [meter, setMeter] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const handleSubmit = async () => {
    setError('');
    const programIds = [...selected];
    const taskIds = [
      ...new Set(programs.filter((p) => selected.has(p.programId)).flatMap((p) => p.serviceTaskIds)),
    ];
    try {
      setSaving(true);
      await axios.post(`/api/assets/${assetId}/service-entries`, {
        servicePrograms: programIds,
        serviceTaskIds: taskIds,
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
          <DialogDescription>Record a completed service. This resets the schedule for the selected programs.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          <ProgramChecklist
            programs={programs}
            selected={selected}
            onToggle={toggle}
            label="Programs serviced"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="svcDate">Date</Label>
              <Input id="svcDate" type="date" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} className="mt-1.5" />
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
