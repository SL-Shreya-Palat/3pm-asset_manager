'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  CheckCircle2,
  AlertTriangle,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn, formatDate } from '@/lib/utils';

// ── Field label map ─────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  sleep_hours: 'Hours of sleep (last 24h)',
  fatigue_level: 'Current fatigue level',
  alcohol_consumed: 'Alcohol consumed (last 12h)',
  drugs_medication: 'Drugs / medication',
  medical_condition: 'Illness / injury / condition',
  mental_wellbeing: 'Emotional & mental wellbeing',
  vision_hearing: 'Vision and hearing',
  physical_fitness: 'Physical fitness',
  ppe_worn: 'PPE worn',
  briefing_received: 'Briefed on tasks & hazards',
};

const VALUE_LABELS: Record<string, string> = {
  '7_plus': '7+ hours',
  '5_to_7': '5–7 hours',
  under_5: 'Less than 5 hours',
  alert: 'Alert and well-rested',
  slightly_tired: 'Slightly tired but fit',
  fatigued: 'Fatigued / drowsy',
  severely_fatigued: 'Severely fatigued',
  no: 'No',
  yes: 'Yes',
  yes_prescribed: 'Yes — prescribed',
  yes_other: 'Yes — other',
  yes_minor: 'Yes — minor',
  yes_significant: 'Yes — significant',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  no_issues: 'No issues',
  minor_issue: 'Minor issue',
  impaired: 'Impaired',
  fit: 'Fit',
  restricted: 'Restricted',
  unfit: 'Unfit',
  na: 'N/A',
};

// ── Types ───────────────────────────────────────────────────────────────────

interface InspectionDefect {
  fieldKey: string;
  label: string;
  answer: string | string[];
  severity: 'high' | 'medium' | 'low';
}

interface InspectionSubmission {
  id: string;
  inspectionNumber: string;
  formTitle: string;
  result: 'pass' | 'fail';
  defectCount: number;
  response: Record<string, unknown>;
  defects: InspectionDefect[];
  operatorName: string | null;
  submittedAt: string;
}

const RESULT_CONFIG = {
  pass: {
    label: 'Pass',
    variant: 'success' as const,
    icon: CheckCircle2,
  },
  fail: {
    label: 'Fail',
    variant: 'destructive' as const,
    icon: AlertTriangle,
  },
};

// ── Component ───────────────────────────────────────────────────────────────

export function DriverInspectionTab({ driverId }: { driverId: string }) {
  const [submissions, setSubmissions] = useState<InspectionSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/drivers/${driverId}/wellness-checks?limit=50`, {
        withCredentials: true,
      });
      setSubmissions(res.data.data?.items || []);
    } catch {
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <p className="mt-4 text-base font-semibold text-foreground">No inspections yet</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Inspection results will appear here after a driver completes an inspection form.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {submissions.map((sub) => {
        const config = RESULT_CONFIG[sub.result] || RESULT_CONFIG.pass;
        const Icon = config.icon;
        const isExpanded = expandedId === sub.id;
        const date = sub.submittedAt ? new Date(sub.submittedAt) : null;

        // Build a defect field set for highlighting
        const defectFieldKeys = new Set((sub.defects || []).map((d) => d.fieldKey));

        return (
          <div
            key={sub.id}
            className="rounded-xl border bg-card shadow-md overflow-hidden"
          >
            {/* Summary row */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : sub.id)}
              className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', {
                'bg-green-100 text-green-700': sub.result === 'pass',
                'bg-red-100 text-red-700': sub.result === 'fail',
              })}>
                <Icon className="h-5 w-5" />
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">
                    {sub.formTitle || 'Inspection'}
                  </span>
                  <Badge variant={config.variant}>{config.label}</Badge>
                  {sub.inspectionNumber && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {sub.inspectionNumber}
                    </span>
                  )}
                  {sub.defectCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {sub.defectCount} defect{sub.defectCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(date)} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {sub.operatorName && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {sub.operatorName}
                    </span>
                  )}
                </div>
              </div>

              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>

            {/* Expanded details */}
            {isExpanded && (
              <div className="border-t px-4 py-4 space-y-4">
                {/* Responses grid */}
                {sub.response && Object.keys(sub.response).length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      Responses
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Object.entries(sub.response).map(([key, val]) => {
                        const isDefect = defectFieldKeys.has(key);
                        const defect = (sub.defects || []).find((d) => d.fieldKey === key);
                        const strVal = String(val ?? '');
                        return (
                          <div
                            key={key}
                            className={cn(
                              'rounded-lg border p-3 text-sm',
                              isDefect
                                ? defect?.severity === 'high'
                                  ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
                                  : 'border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950'
                                : 'bg-card',
                            )}
                          >
                            <p className="text-xs font-medium text-muted-foreground">
                              {FIELD_LABELS[key] || key}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="font-medium text-foreground">
                                {VALUE_LABELS[strVal] || strVal}
                              </p>
                              {isDefect && defect && (
                                <Badge
                                  variant={defect.severity === 'high' ? 'destructive' : 'warning'}
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {defect.severity === 'high' ? 'High' : defect.severity === 'medium' ? 'Medium' : 'Low'}
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Defects summary (if any) */}
                {sub.defects && sub.defects.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Defects Raised
                    </h4>
                    <div className="space-y-1.5">
                      {sub.defects.map((d, i) => {
                        const answerStr = Array.isArray(d.answer) ? d.answer.join(', ') : d.answer;
                        return (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <Badge
                              variant={d.severity === 'high' ? 'destructive' : d.severity === 'medium' ? 'warning' : 'outline'}
                              className="text-[10px] px-1.5 py-0 shrink-0"
                            >
                              {d.severity === 'high' ? 'High' : d.severity === 'medium' ? 'Medium' : 'Low'}
                            </Badge>
                            <span className="text-foreground">
                              {d.label} — {VALUE_LABELS[String(answerStr)] || answerStr}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
