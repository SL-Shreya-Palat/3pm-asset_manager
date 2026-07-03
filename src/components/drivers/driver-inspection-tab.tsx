'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

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

interface WellnessCheck {
  id: string;
  outcome: 'fit' | 'fit_with_concerns' | 'not_fit';
  concerns: { field: string; value: string; severity: 'critical' | 'non_critical' }[];
  answers: Record<string, string>;
  comments: string;
  fitForDutyDeclared: boolean;
  submittedBy: { email?: string; name?: string };
  createdAt: string;
}

const OUTCOME_CONFIG = {
  fit: {
    label: 'Fit',
    variant: 'success' as const,
    icon: CheckCircle2,
    color: 'text-green-600',
  },
  fit_with_concerns: {
    label: 'Fit with Concerns',
    variant: 'warning' as const,
    icon: AlertCircle,
    color: 'text-yellow-600',
  },
  not_fit: {
    label: 'Not Fit',
    variant: 'destructive' as const,
    icon: AlertTriangle,
    color: 'text-red-600',
  },
};

// ── Component ───────────────────────────────────────────────────────────────

export function DriverInspectionTab({ driverId }: { driverId: string }) {
  const [checks, setChecks] = useState<WellnessCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchChecks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/drivers/${driverId}/wellness-checks?limit=50`, {
        withCredentials: true,
      });
      setChecks(res.data.data?.items || []);
    } catch {
      setChecks([]);
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    fetchChecks();
  }, [fetchChecks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (checks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <p className="mt-4 text-base font-semibold text-foreground">No wellness checks yet</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Wellness checks will appear here after a driver completes an inspection form.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {checks.map((check) => {
        const config = OUTCOME_CONFIG[check.outcome] || OUTCOME_CONFIG.fit;
        const Icon = config.icon;
        const isExpanded = expandedId === check.id;
        const date = new Date(check.createdAt);

        return (
          <div
            key={check.id}
            className="rounded-xl border bg-card shadow-md overflow-hidden"
          >
            {/* Summary row */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : check.id)}
              className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', {
                'bg-green-100 text-green-700': check.outcome === 'fit',
                'bg-yellow-100 text-yellow-700': check.outcome === 'fit_with_concerns',
                'bg-red-100 text-red-700': check.outcome === 'not_fit',
              })}>
                <Icon className="h-5 w-5" />
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">
                    Wellness Check
                  </span>
                  <Badge variant={config.variant}>{config.label}</Badge>
                  {check.concerns.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {check.concerns.length} concern{check.concerns.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {check.submittedBy?.name && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {check.submittedBy.name}
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
                {/* Answers grid */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Responses
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(check.answers).map(([key, val]) => {
                      const isConcern = check.concerns.some((c) => c.field === key);
                      const concern = check.concerns.find((c) => c.field === key);
                      return (
                        <div
                          key={key}
                          className={cn(
                            'rounded-lg border p-3 text-sm',
                            isConcern
                              ? concern?.severity === 'critical'
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
                              {VALUE_LABELS[val] || val}
                            </p>
                            {isConcern && concern && (
                              <Badge
                                variant={concern.severity === 'critical' ? 'destructive' : 'warning'}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {concern.severity === 'critical' ? 'Critical' : 'Concern'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Declaration & comments */}
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">Fit for duty declared:</span>
                  <Badge variant={check.fitForDutyDeclared ? 'success' : 'warning'}>
                    {check.fitForDutyDeclared ? 'Yes' : 'No'}
                  </Badge>
                </div>

                {check.comments && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Comments
                    </h4>
                    <p className="text-sm text-foreground bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">
                      {check.comments}
                    </p>
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
