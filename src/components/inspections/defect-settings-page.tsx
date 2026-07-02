'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, Save, ShieldAlert, Power, Ban, RotateCcw, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

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
  ignored: boolean;
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
  const [fields, setFields] = useState<EligibleField[]>([]);

  // Track user edits: fieldKey → set of ticked defect values
  const [defectAnswers, setDefectAnswers] = useState<Record<string, Set<string>>>({});
  const [severityByField, setSeverityByField] = useState<Record<string, 'critical' | 'non_critical'>>({});
  const [outOfServiceByField, setOutOfServiceByField] = useState<Record<string, boolean>>({});
  const [ignoredByField, setIgnoredByField] = useState<Record<string, boolean>>({});

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
      setFields(data.fields);

      // Initialize state from saved ticks
      const answers: Record<string, Set<string>> = {};
      const severities: Record<string, 'critical' | 'non_critical'> = {};
      const oos: Record<string, boolean> = {};
      const ign: Record<string, boolean> = {};
      for (const f of data.fields) {
        answers[f.fieldKey] = new Set(f.selectedDefectValues);
        severities[f.fieldKey] = f.severity;
        oos[f.fieldKey] = f.outOfService;
        ign[f.fieldKey] = f.ignored;
      }
      setDefectAnswers(answers);
      setSeverityByField(severities);
      setOutOfServiceByField(oos);
      setIgnoredByField(ign);
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

  function toggleIgnore(fieldKey: string) {
    const willIgnore = !(ignoredByField[fieldKey] || false);
    setIgnoredByField((prev) => ({ ...prev, [fieldKey]: willIgnore }));
    if (willIgnore) {
      // An ignored field must do nothing — clear its flagged answers + out-of-service.
      setDefectAnswers((prev) => ({ ...prev, [fieldKey]: new Set() }));
      setOutOfServiceByField((prev) => ({ ...prev, [fieldKey]: false }));
    }
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
          ignoredByField,
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
  const flaggedFieldCount = Object.values(defectAnswers).filter((s) => s.size > 0).length;

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
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">Defect Settings</h1>
          <p className="text-sm text-muted-foreground">{formTitle}</p>
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
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
          {success}
        </div>
      )}

      {/* How it works */}
      {fields.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/40">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <div>
            <p className="font-medium text-blue-900 dark:text-blue-200">How defects are created</p>
            <p className="mt-0.5 leading-relaxed text-blue-800/90 dark:text-blue-300/90">
              For each question, tick the answer(s) that mean a <span className="font-medium">fault</span>.
              When someone submits the form and picks a ticked answer, a defect is raised automatically for
              that asset. Set the <span className="font-medium">severity</span>, turn on{' '}
              <span className="font-medium">Out of service</span> to also take the asset off the road, or{' '}
              <span className="font-medium">Ignore</span> a question so it does nothing. Only choice questions
              (dropdown, radio, multi-select, checkbox, toggle) can trigger defects.
            </p>
          </div>
        </div>
      )}

      {/* No eligible fields */}
      {fields.length === 0 && (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center text-muted-foreground">
          <ShieldAlert className="mx-auto mb-2 h-8 w-8" />
          <p>No eligible fields found in this form.</p>
          <p className="text-xs">Only dropdown, radio, multiselect, checkbox, and toggle fields can be configured.</p>
        </div>
      )}

      {/* Field blocks — grouped by form page */}
      <div className="space-y-8">
        {groups.map((group) => {
          const groupTicked = group.fields.filter(
            (f) => (defectAnswers[f.fieldKey]?.size ?? 0) > 0,
          ).length;

          return (
            <section key={group.page} className="space-y-2.5">
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {group.page}
                </h2>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-medium',
                    groupTicked > 0
                      ? 'bg-foreground/10 text-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {groupTicked > 0
                    ? `${groupTicked} of ${group.fields.length} flagged`
                    : `${group.fields.length} question${group.fields.length !== 1 ? 's' : ''}`}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-2">
                {group.fields.map((field) => {
                  const ignored = ignoredByField[field.fieldKey] || false;
                  const ticked = defectAnswers[field.fieldKey] || new Set<string>();
                  const hasTicks = ticked.size > 0;
                  const oos = outOfServiceByField[field.fieldKey] || false;
                  const sev = severityByField[field.fieldKey] || 'non_critical';

                  return (
                    <div
                      key={field.fieldKey}
                      className={cn(
                        'flex flex-col gap-3 rounded-xl border px-4 py-3 transition-colors md:flex-row md:items-center md:gap-4',
                        ignored
                          ? 'border-dashed border-border bg-muted/30'
                          : hasTicks
                            ? 'border-foreground/15 bg-muted/40'
                            : 'border-border bg-card hover:border-foreground/20',
                      )}
                    >
                      {/* Left: label + plain-language summary */}
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-sm font-medium',
                            ignored ? 'text-muted-foreground line-through' : 'text-foreground',
                          )}
                        >
                          {field.label}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {ignored ? (
                            'Ignored — never raises a defect'
                          ) : hasTicks ? (
                            <>
                              Raises a{' '}
                              <span
                                className={cn(
                                  'font-medium',
                                  sev === 'critical' ? 'text-red-600 dark:text-red-400' : 'text-foreground',
                                )}
                              >
                                {sev === 'critical' ? 'Critical' : 'Non-Critical'}
                              </span>{' '}
                              defect
                              {oos && (
                                <>
                                  {' · '}
                                  <span className="font-medium text-red-600 dark:text-red-400">
                                    takes asset out of service
                                  </span>
                                </>
                              )}
                            </>
                          ) : (
                            'No fault answer set'
                          )}
                        </p>
                      </div>

                      {/* Right: controls */}
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        {ignored ? (
                          <button
                            type="button"
                            onClick={() => toggleIgnore(field.fieldKey)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restore
                          </button>
                        ) : (
                          <>
                            {/* Answer trigger pills */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {field.options.map((opt) => {
                                const checked = ticked.has(opt.value);
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    role="checkbox"
                                    aria-checked={checked}
                                    onClick={() => toggleDefectValue(field.fieldKey, opt.value)}
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                      checked
                                        ? 'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                                        : 'border-border bg-background text-foreground/70 hover:border-foreground/30 hover:text-foreground',
                                    )}
                                  >
                                    {checked && <Check className="h-3 w-3" />}
                                    {opt.title}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Consequence cluster — severity + out of service */}
                            {hasTicks && (
                              <div className="flex items-center gap-1.5 md:ml-1 md:border-l md:border-border/70 md:pl-2.5">
                                <Select
                                  value={sev}
                                  onValueChange={(v) =>
                                    updateSeverity(field.fieldKey, v as 'critical' | 'non_critical')
                                  }
                                >
                                  <SelectTrigger
                                    className={cn(
                                      'h-8 w-33 text-xs',
                                      sev === 'critical' && 'text-red-600 dark:text-red-400',
                                    )}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="critical">Critical</SelectItem>
                                    <SelectItem value="non_critical">Non-Critical</SelectItem>
                                  </SelectContent>
                                </Select>

                                <button
                                  type="button"
                                  onClick={() => toggleOutOfService(field.fieldKey)}
                                  aria-pressed={oos}
                                  title="Put the asset Under Maintenance when this answer is submitted"
                                  className={cn(
                                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                                    oos
                                      ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                                      : 'border-border bg-background text-muted-foreground hover:border-red-300 hover:text-red-600',
                                  )}
                                >
                                  <Power className="h-3.5 w-3.5" />
                                  Out of service
                                </button>
                              </div>
                            )}

                            {/* Ignore — quiet secondary action */}
                            <button
                              type="button"
                              onClick={() => toggleIgnore(field.fieldKey)}
                              title="Ignore this question — it will do nothing"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <Ban className="h-3.5 w-3.5" />
                              Ignore
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Sticky summary footer */}
      {fields.length > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-3 text-sm shadow-lg backdrop-blur supports-backdrop-filter:bg-card/80">
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{totalTicked}</span> defect trigger
            {totalTicked !== 1 ? 's' : ''} across{' '}
            <span className="font-medium text-foreground">{flaggedFieldCount}</span> question
            {flaggedFieldCount !== 1 ? 's' : ''}
          </span>
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      )}
    </div>
  );
}
