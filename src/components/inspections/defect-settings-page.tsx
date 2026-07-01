'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, Save, ShieldAlert, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  page: string;
  options: FieldOption[];
  selectedDefectValues: string[];
  severity: 'critical' | 'non_critical';
  outOfService: boolean;
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
  const [outOfServiceByField, setOutOfServiceByField] = useState<Record<string, boolean>>({});

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
      const oos: Record<string, boolean> = {};
      for (const f of data.fields) {
        answers[f.fieldKey] = new Set(f.selectedDefectValues);
        severities[f.fieldKey] = f.severity;
        oos[f.fieldKey] = f.outOfService;
      }
      setDefectAnswers(answers);
      setSeverityByField(severities);
      setOutOfServiceByField(oos);
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

  function toggleOutOfService(fieldKey: string) {
    setOutOfServiceByField((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
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
          outOfServiceByField,
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

  // Group eligible fields by their form page (fields arrive in page order).
  const groups: { page: string; fields: EligibleField[] }[] = [];
  for (const f of fields) {
    let g = groups.find((x) => x.page === f.page);
    if (!g) {
      g = { page: f.page || 'Other', fields: [] };
      groups.push(g);
    }
    g.fields.push(f);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
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

      {/* How it works */}
      {fields.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/40">
          <p className="font-medium text-blue-900 dark:text-blue-200">How defects are created</p>
          <p className="mt-0.5 text-blue-800/90 dark:text-blue-300/90">
            For each question below, tick the answer(s) that mean a fault. When someone submits
            this form and picks a ticked answer, a defect is raised automatically for that asset.
            Turn on <span className="font-medium">Out of service</span> for a question (e.g. &ldquo;Safe to
            operate&rdquo;) to also take the asset off the road when it fails. Only choice questions
            (dropdown, radio, multi-select, checkbox, toggle) can trigger defects.
          </p>
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

      {/* Field blocks — grouped by form page, compact one-row layout */}
      <div className="space-y-6">
        {groups.map((group) => {
          const groupTicked = group.fields.filter(
            (f) => (defectAnswers[f.fieldKey]?.size ?? 0) > 0,
          ).length;

          return (
            <section key={group.page} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 border-b pb-1.5">
                <h2 className="text-sm font-semibold text-foreground">{group.page}</h2>
                <span className="text-xs text-muted-foreground">
                  {groupTicked > 0 ? `${groupTicked} of ` : ''}
                  {group.fields.length} question{group.fields.length !== 1 ? 's' : ''}
                  {groupTicked > 0 ? ' flagged' : ''}
                </span>
              </div>

              {group.fields.map((field) => {
                const ticked = defectAnswers[field.fieldKey] || new Set<string>();
                const hasTicks = ticked.size > 0;
                const oos = outOfServiceByField[field.fieldKey] || false;

                return (
                  <div
                    key={field.fieldKey}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2 transition-colors ${
                      hasTicks ? 'border-orange-300 bg-orange-50/60' : 'bg-card'
                    }`}
                  >
                    <span className="min-w-[140px] flex-1 text-sm font-medium text-foreground">
                      {field.label}
                    </span>

                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {field.options.map((opt) => {
                        const checked = ticked.has(opt.value);
                        return (
                          <label
                            key={opt.id}
                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                              checked
                                ? 'border-orange-300 bg-orange-100/70 font-medium text-orange-800'
                                : 'border-border hover:bg-muted/50'
                            }`}
                          >
                            <Checkbox
                              className="h-3.5 w-3.5"
                              checked={checked}
                              onCheckedChange={() => toggleDefectValue(field.fieldKey, opt.value)}
                            />
                            {opt.title}
                          </label>
                        );
                      })}

                      {/* Severity + Out-of-Service — inline once an answer is flagged */}
                      {hasTicks && (
                        <Select
                          value={severityByField[field.fieldKey] || 'non_critical'}
                          onValueChange={(v) =>
                            updateSeverity(field.fieldKey, v as 'critical' | 'non_critical')
                          }
                        >
                          <SelectTrigger className="h-7 w-[118px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="critical">Critical</SelectItem>
                            <SelectItem value="non_critical">Non-Critical</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {hasTicks && (
                        <button
                          type="button"
                          onClick={() => toggleOutOfService(field.fieldKey)}
                          title="Take the asset Out of Service when this answer is submitted"
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                            oos
                              ? 'border-red-300 bg-red-100 font-medium text-red-700'
                              : 'border-border text-muted-foreground hover:bg-muted/50'
                          }`}
                        >
                          <Power className="h-3.5 w-3.5" />
                          Out of service
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
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
