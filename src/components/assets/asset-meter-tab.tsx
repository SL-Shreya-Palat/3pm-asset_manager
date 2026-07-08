'use client';

/**
 * Asset Meter tab — odometer / engine-hours reading history + manual entry.
 * The newest reading advances the asset's current meter (which drives service
 * due-status). Mirrors the Service/Fuel tab pattern.
 */
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Gauge, Clock, Plus, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ui/date-field';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { MeterTypeSelect } from '@/components/maintenance/service-fields';

interface Reading {
  id: string;
  meterType: 'odometer' | 'engine_hours' | string;
  value: number;
  readingAt: string | null;
  source: string;
  notes: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const UNIT: Record<string, string> = { odometer: 'km', engine_hours: 'hrs', hubometer: 'km' };

export function AssetMeterTab({ assetId }: { assetId: string }) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const fetchReadings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/assets/${assetId}/meter-readings`, { withCredentials: true });
      setReadings(res.data.data?.items ?? []);
    } catch {
      setReadings([]);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  // Defer so setState isn't called synchronously inside the effect body.
  useEffect(() => {
    const t = setTimeout(() => fetchReadings(), 0);
    return () => clearTimeout(t);
  }, [fetchReadings]);

  const latest = (type: string) => readings.find((r) => r.meterType === type) ?? null;
  const latestOdo = latest('odometer');
  const latestHrs = latest('engine_hours');
  const latestHub = latest('hubometer');

  const handleAdded = () => { setAddOpen(false); fetchReadings(); };

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
      {/* Current meters (latest reading per type) */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={<Gauge className="h-4 w-4" />}
          label="Current Odometer"
          value={latestOdo ? `${latestOdo.value.toLocaleString()} km` : '—'}
          hint={latestOdo ? `as of ${formatDate(latestOdo.readingAt)}` : undefined}
        />
        <StatCard
          icon={<CircleDot className="h-4 w-4" />}
          label="Current Hubometer"
          value={latestHub ? `${latestHub.value.toLocaleString()} km` : '—'}
          hint={latestHub ? `as of ${formatDate(latestHub.readingAt)}` : undefined}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Current Engine Hours"
          value={latestHrs ? `${latestHrs.value.toLocaleString()} hrs` : '—'}
          hint={latestHrs ? `as of ${formatDate(latestHrs.readingAt)}` : undefined}
        />
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground">
          Reading History
          <span className="text-muted-foreground font-normal ml-2">({readings.length})</span>
        </h3>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Reading
        </Button>
      </div>

      {readings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No meter readings yet.</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {readings.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="min-w-0">
                <span className="text-sm font-medium text-foreground">
                  {r.value.toLocaleString()} {UNIT[r.meterType] || ''}
                </span>
                <span className="text-xs text-muted-foreground ml-2 capitalize">
                  {r.meterType.replace('_', ' ')}
                </span>
                {r.notes && <p className="text-xs text-muted-foreground mt-0.5">{r.notes}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-foreground">{formatDate(r.readingAt)}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{r.source}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <AddReadingDialog assetId={assetId} onClose={() => setAddOpen(false)} onAdded={handleAdded} />
      )}
    </div>
  );
}

function AddReadingDialog({
  assetId, onClose, onAdded,
}: {
  assetId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  // Mounted fresh per open (via conditional render), so plain initial state is fine.
  const [meterType, setMeterType] = useState('odometer');
  const [value, setValue] = useState('');
  const [readingAt, setReadingAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!value || Number(value) < 0) { setError('Enter a valid meter value'); return; }
    try {
      setSaving(true);
      await axios.post(`/api/assets/${assetId}/meter-readings`, {
        meterType,
        value: parseFloat(value),
        readingAt: readingAt || undefined,
        notes: notes.trim() || undefined,
      }, { withCredentials: true });
      onAdded();
    } catch {
      setError('Failed to add reading');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Meter Reading</DialogTitle>
          <DialogDescription>The newest reading updates the asset&apos;s current meter and service due-status.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Meter type</Label>
              <MeterTypeSelect value={meterType} onChange={setMeterType} />
            </div>
            <div>
              <Label htmlFor="mrValue">Value</Label>
              <Input id="mrValue" type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 50000" className="mt-1.5" />
            </div>
          </div>
          <div>
            <DateField id="mrDate" label="Reading date" value={readingAt} onChange={setReadingAt} placeholder="Select date" />
          </div>
          <div>
            <Label htmlFor="mrNotes">Notes</Label>
            <Input id="mrNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="mt-1.5" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : 'Add Reading'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
