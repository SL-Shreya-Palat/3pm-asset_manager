'use client';

/**
 * Admin screen for the tenant's meter policy.
 *
 * Controls whether a meter reading captured on work-order completion / "Log
 * Service" advances the asset's current meter (and its service baseline), or is
 * kept only as a reference on the service-history record. Backed by
 * /api/settings/meters (GET/PUT). The manual "Add Reading" on an asset's Meter
 * tab always updates the current meter — it's an explicit reading, unaffected by
 * this setting.
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Save, Gauge, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';

export function MeterSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [serviceUpdatesCurrentMeter, setServiceUpdatesCurrentMeter] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await axios.get('/api/settings/meters', { withCredentials: true });
      const d = res.data.data;
      if (d) setServiceUpdatesCurrentMeter(d.serviceUpdatesCurrentMeter !== false);
    } catch {
      setError('Failed to load meter settings');
    } finally {
      setLoading(false);
    }
  }, []);

  // Defer so setState isn't called synchronously inside the effect body.
  useEffect(() => {
    const t = setTimeout(() => fetchSettings(), 0);
    return () => clearTimeout(t);
  }, [fetchSettings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await axios.put(
        '/api/settings/meters',
        { serviceUpdatesCurrentMeter },
        { withCredentials: true },
      );
      setSuccess('Meter settings saved');
    } catch {
      setError('Failed to save meter settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" /> Loading…
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Gauge className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Meter Readings</h2>
      </div>

      <div className="rounded-lg border border-border p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            className="mt-0.5"
            checked={serviceUpdatesCurrentMeter}
            onCheckedChange={(v) => {
              setSuccess('');
              setServiceUpdatesCurrentMeter(v === true);
            }}
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Work orders &amp; service logs update the asset&apos;s current meter
            </span>
            <span className="block text-sm text-muted-foreground mt-0.5">
              When on, a meter reading entered while completing a work order or logging a service
              advances the asset&apos;s current odometer / engine hours and resets its service
              baseline. When off, the reading is saved on the service record for reference only —
              the current meter is left unchanged.
            </span>
          </span>
        </label>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          The manual “Add Reading” on an asset&apos;s Meter tab always updates the current meter —
          it&apos;s an explicit reading and isn&apos;t affected by this setting.
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> {success}
        </p>
      )}

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        {saving ? 'Saving…' : 'Save Changes'}
      </Button>
    </div>
  );
}
