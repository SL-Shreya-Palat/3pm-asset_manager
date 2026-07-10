'use client';

/**
 * Admin screen for the tenant's driver-inspection policy.
 *
 * One org-wide policy: turn driver inspections on/off, pick the driver-type form
 * drivers must complete, and choose how often (daily / weekly / monthly). When
 * on, a driver who hasn't completed the form this period is blocked by the
 * in-app gate until they submit it. Backed by /api/settings/driver-inspections.
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Save, ClipboardCheck, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

type Frequency = 'daily' | 'weekly' | 'monthly';

const FREQUENCY_OPTIONS: { value: Frequency; label: string; hint: string }[] = [
  { value: 'daily', label: 'Every day', hint: 'Resets at midnight — a fresh check each day.' },
  { value: 'weekly', label: 'Every week', hint: 'Resets Monday — one check per week.' },
  { value: 'monthly', label: 'Every month', hint: 'Resets on the 1st — one check per month.' },
];

interface DriverForm {
  formId: string;
  title: string;
}

export function DriverInspectionSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [enabled, setEnabled] = useState(false);
  const [formId, setFormId] = useState<string>('');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [forms, setForms] = useState<DriverForm[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      // Seed pre-start forms (idempotent) so at least the default wellness form exists.
      await axios.post('/api/forms/seed-prestart', {}, { withCredentials: true }).catch(() => {});

      const [settingsRes, formsRes] = await Promise.all([
        axios.get('/api/settings/driver-inspections', { withCredentials: true }),
        axios.get('/api/forms?status=published&includeSchema=false', { withCredentials: true }),
      ]);

      const s = settingsRes.data.data;
      if (s) {
        setEnabled(!!s.enabled);
        setFormId(s.formId || '');
        setFrequency((s.frequency as Frequency) || 'daily');
      }

      const allForms = formsRes.data?.data?.items || [];
      const driverForms: DriverForm[] = allForms
        .filter((f: Record<string, unknown>) => f.inspectionType === 'driver')
        .map((f: Record<string, unknown>) => ({
          formId: String(f.formId || f.id),
          title: String(f.title || f.formTitle || 'Untitled form'),
        }));
      setForms(driverForms);
    } catch {
      setError('Failed to load driver inspection settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchAll(), 0);
    return () => clearTimeout(t);
  }, [fetchAll]);

  const handleSave = async () => {
    setError('');
    setSuccess('');
    if (enabled && !formId) {
      setError('Select an inspection form before turning driver inspections on.');
      return;
    }
    try {
      setSaving(true);
      await axios.put(
        '/api/settings/driver-inspections',
        { enabled, formId: formId || null, frequency },
        { withCredentials: true },
      );
      setSuccess('Driver inspection settings saved');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to save driver inspection settings');
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

  const noForms = forms.length === 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Driver Inspections</h2>
      </div>

      {/* Enable toggle */}
      <div className="rounded-lg border border-border p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            className="mt-0.5"
            checked={enabled}
            onCheckedChange={(v) => {
              setSuccess('');
              setEnabled(v === true);
            }}
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Require drivers to complete an inspection
            </span>
            <span className="block text-sm text-muted-foreground mt-0.5">
              When on, a driver who hasn&apos;t completed the assigned form in the current period is
              prompted to fill it as soon as they open the app, and is blocked from everything else
              until they submit it.
            </span>
          </span>
        </label>
      </div>

      {/* Form + frequency (only meaningful when enabled) */}
      <div
        className={enabled ? 'space-y-5' : 'space-y-5 opacity-50 pointer-events-none select-none'}
        aria-disabled={!enabled}
      >
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">Inspection form</label>
          {noForms ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                No driver inspection forms found. Create one under <strong>Inspections → Forms</strong>{' '}
                and set its type to <strong>Driver</strong>, then come back here.
              </span>
            </div>
          ) : (
            <Select value={formId} onValueChange={(v) => { setSuccess(''); setFormId(v); }}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Select a driver inspection form" />
              </SelectTrigger>
              <SelectContent>
                {forms.map((f) => (
                  <SelectItem key={f.formId} value={f.formId}>
                    {f.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            Only forms typed as <strong>Driver</strong> appear here.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">How often</label>
          <Select value={frequency} onValueChange={(v) => { setSuccess(''); setFrequency(v as Frequency); }}>
            <SelectTrigger className="max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {FREQUENCY_OPTIONS.find((o) => o.value === frequency)?.hint}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Completing the form logs to the driver&apos;s inspection history and clears the prompt for
          the period. A failed check still counts as completed for scheduling — it separately flags
          the driver unfit for review.
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
