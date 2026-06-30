'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, Save, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

// ── types ────────────────────────────────────────────────────────────────────

interface FieldOption {
  id: string;
  title: string;
  value: string;
}

interface EligibleField {
  fieldKey: string;
  label: string;
  type: string;
  options: FieldOption[];
  selectedDefectValues: string[];
  severity: 'critical' | 'non_critical';
}

interface DefectSettingsData {
  formId: string;
  formTitle: string;
  formVersion: number;
  fields: EligibleField[];
  savedSettings: unknown;
}

// ── component ────────────────────────────────────────────────────────────────

interface DefectSettingsPageProps {
  formId: string;
}

export function DefectSettingsPage({ formId }: DefectSettingsPageProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formTitle, setFormTitle] = useState('');
  const [formVersion, setFormVersion] = useState(0);
  const [fields, setFields] = useState<EligibleField[]>([]);

  // Track user edits: fieldKey → set of ticked defect values
  const [defectAnswers, setDefectAnswers] = useState<Record<string, Set<string>>>({});
  const [severityByField, setSeverityByField] = useState<Record<string, 'critical' | 'non_critical'>>({});

  // ── Load ─────────────────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await axios.get<{ data: DefectSettingsData; error: string | null }>(
        `/api/defect-settings/${formId}`,
        { withCredentials: true },
      );

      if (res.data.error) {
        setError(res.data.error);
        return;
      }

      const data = res.data.data;
      setFormTitle(data.formTitle);
      setFormVersion(data.formVersion);
      setFields(data.fields);

      // Initialize state from saved ticks
      const answers: Record<string, Set<string>> = {};
      const severities: Record<string, 'critical' | 'non_critical'> = {};
      for (const f of data.fields) {
        answers[f.fieldKey] = new Set(f.selectedDefectValues);
        severities[f.fieldKey] = f.severity;
      }
      setDefectAnswers(answers);
      setSeverityByField(severities);
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : 'Failed to load settings';
      setError(msg || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // ── Toggle a defect tick ─────────────────────────────────────────────────

  function toggleDefectValue(fieldKey: string, value: string) {
    setDefectAnswers((prev) => {
      const next = { ...prev };
      const set = new Set(next[fieldKey] || []);
      if (set.has(value)) {
        set.delete(value);
      } else {
        set.add(value);
      }
      next[fieldKey] = set;
      return next;
    });
    setSuccess('');
  }

  function updateSeverity(fieldKey: string, sev: 'critical' | 'non_critical') {
    setSeverityByField((prev) => ({ ...prev, [fieldKey]: sev }));
    setSuccess('');
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      // Convert Sets to arrays
      const answersPayload: Record<string, string[]> = {};
      for (const [key, set] of Object.entries(defectAnswers)) {
        if (set.size > 0) {
          answersPayload[key] = Array.from(set);
        }
      }

      await axios.put(
        `/api/defect-settings/${formId}`,
        {
          defectAnswers: answersPayload,
          severityByField,
        },
        { withCredentials: true },
      );

      setSuccess('Defect settings saved successfully');
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : 'Failed to save';
      setError(msg || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const totalTicked = Object.values(defectAnswers).reduce((sum, s) => sum + s.size, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <button
            onClick={() => router.back()}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">Defect Settings</h1>
          <p className="text-sm text-muted-foreground">
            {formTitle}
            <Badge variant="outline" className="ml-2">v{formVersion}</Badge>
          </p>
          <p className="text-sm text-muted-foreground">
            Tick which answer values should automatically create a defect when this form is submitted.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="shrink-0">
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {success}
        </div>
      )}

      {/* No eligible fields */}
      {fields.length === 0 && (
        <div className="rounded-md border border-dashed px-6 py-10 text-center text-muted-foreground">
          <ShieldAlert className="mx-auto mb-2 h-8 w-8" />
          <p>No eligible fields found in this form.</p>
          <p className="text-xs">Only dropdown, radio, multiselect, checkbox, and toggle fields can be configured.</p>
        </div>
      )}

      {/* Field blocks */}
      <div className="space-y-4">
        {fields.map((field) => {
          const ticked = defectAnswers[field.fieldKey] || new Set<string>();
          const hasTicks = ticked.size > 0;

          return (
            <div
              key={field.fieldKey}
              className={`rounded-lg border p-4 transition-colors ${
                hasTicks ? 'border-orange-200 bg-orange-50/50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium">{field.label}</h3>
                  <p className="text-xs text-muted-foreground capitalize">
                    {field.type === 'toggle' || field.type === 'checkbox'
                      ? `${field.type} — tick when defect`
                      : field.type}
                  </p>
                </div>

                {/* Severity selector — only show when at least one tick */}
                {hasTicks && (
                  <Select
                    value={severityByField[field.fieldKey] || 'non_critical'}
                    onValueChange={(v) =>
                      updateSeverity(field.fieldKey, v as 'critical' | 'non_critical')
                    }
                  >
                    <SelectTrigger className="h-8 w-[140px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="non_critical">Non-Critical</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Options as checkboxes */}
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {field.options.map((opt) => {
                  const checked = ticked.has(opt.value);
                  return (
                    <label
                      key={opt.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          toggleDefectValue(field.fieldKey, opt.value)
                        }
                      />
                      <span className={checked ? 'font-medium text-orange-700' : ''}>
                        {opt.title}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary footer */}
      {fields.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {totalTicked} defect trigger{totalTicked !== 1 ? 's' : ''} configured across{' '}
            {Object.values(defectAnswers).filter((s) => s.size > 0).length} field{Object.values(defectAnswers).filter((s) => s.size > 0).length !== 1 ? 's' : ''}
          </span>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  );
}
