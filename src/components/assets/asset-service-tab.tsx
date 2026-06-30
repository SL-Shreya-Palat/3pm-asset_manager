'use client';

/**
 * Asset Service tab — preventative-maintenance status + history.
 * Lists each service program assigned to the asset with its computed due-status,
 * lets the user Log a completed service (which resets the schedule), and shows
 * recent service history. Mirrors the Fuel tab pattern.
 */
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Wrench, AlertTriangle, Clock, CheckCircle2, Plus, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { MeterTypeSelect, ProgramChecklist } from '@/components/maintenance/service-fields';

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
        <SummaryCard icon={<AlertTriangle className="h-4 w-4" />} label="Overdue" value={summary.overdue} accent="text-red-600" />
        <SummaryCard icon={<Clock className="h-4 w-4" />} label="Due soon" value={summary.dueSoon} accent="text-amber-600" />
        <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Up to date" value={summary.ok} accent="text-emerald-600" />
      </div>

      {/* Programs */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground">Service Schedule</h3>
        <Button size="sm" onClick={() => openLog(null)}>
          <Plus className="h-4 w-4" /> Log Service
        </Button>
      </div>

      {programs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Wrench className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No service programs assigned to this asset. Assign one from Maintenance → Service Programs.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border mb-8">
          {programs.map((p) => (
            <div key={p.programId} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{p.title}</span>
                  <Badge className={STATUS_META[p.status].className}>{STATUS_META[p.status].label}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {p.triggers.map((t, i) => (
                    <span key={i} className="text-xs text-muted-foreground">{t.label}</span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last performed: {formatDate(p.lastPerformedAt)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => openLog(p.programId)}>
                Log
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-base font-semibold text-foreground">Service History</h3>
        <span className="text-muted-foreground text-sm">({history.length})</span>
      </div>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No services logged yet.</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {history.map((h) => (
            <div key={h.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{formatDate(h.performedAt)}</span>
                {h.totalCost != null && <span className="text-sm text-foreground">${h.totalCost.toFixed(2)}</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {[...h.programNames, ...h.taskNames].filter(Boolean).join(', ') || 'Service'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {h.meterAtService != null && (
                  <span>{h.meterAtService.toLocaleString()} {h.meterType === 'engine_hours' ? 'hrs' : 'mi/km'} · </span>
                )}
                {h.performedByName || 'Unknown'}
              </p>
              {h.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{h.notes}</p>}
            </div>
          ))}
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

function SummaryCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}<span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-semibold ${accent}`}>{value}</p>
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
