'use client';

/**
 * Asset Faults & Defects tab — every issue raised against a single asset.
 *
 * Faults and defects share the `defects` collection (discriminated by `source`:
 * `fault` | `prestart_inspection` | `manual`). We fetch them together via the
 * defects API (no source filter → all) and tag each row with a TYPE badge so
 * you can tell a fault from an inspection defect from a manual defect at a
 * glance. Rows link to the matching detail page.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { AlertCircle, Calendar, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PRIORITY_BADGE_CLASSES,
  PRIORITY_DISPLAY_NAME,
  SEVERITY_DISPLAY_NAME,
} from '@/components/faults/types';
import { cn } from '@/lib/utils';
import { FormattedDate } from '@/components/ui/formatted-date';

interface IssueRow {
  id: string;
  defectNumber: string;
  name: string;
  date: string | null;
  assetName: string | null;
  priority: string;
  severity: string;
  status: string;
  workOrderNumber: string | null;
  source: string;
  createdAt: string | null;
}

/** TYPE badge per source — the thing that differentiates faults from defects. */
const TYPE_META: Record<string, { label: string; className: string }> = {
  fault: { label: 'Fault', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  prestart_inspection: { label: 'Inspection Defect', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  manual: { label: 'Defect', className: 'bg-slate-100 text-slate-700 hover:bg-slate-100' },
};
function typeMeta(source: string) {
  return TYPE_META[source] ?? TYPE_META.manual;
}

/** Generic status badge — faults (open/resolved/wont_fix) and defects (new/corrected) share this. */
function statusMeta(status: string): { label: string; variant: 'success' | 'warning' | 'default' | 'outline' | 'secondary' } {
  const s = (status || '').toLowerCase();
  const label = s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Open';
  if (['resolved', 'corrected', 'closed', 'done'].includes(s)) return { label, variant: 'success' };
  if (['open', 'new'].includes(s)) return { label, variant: 'warning' };
  if (['in_progress', 'assigned', 'on_hold'].includes(s)) return { label, variant: 'default' };
  if (['wont_fix'].includes(s)) return { label: "Won't Fix", variant: 'outline' };
  return { label, variant: 'secondary' };
}

export function AssetFaultsTab({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      // No `source` filter → returns faults + inspection defects + manual defects.
      const res = await axios.get(`/api/defects?assetId=${assetId}&limit=100`, {
        withCredentials: true,
      });
      setRows(res.data.data?.items || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
          <AlertCircle className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-foreground">No faults or defects recorded</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Faults and defects raised against this asset will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const type = typeMeta(row.source);
        const st = statusMeta(row.status);
        const isFault = row.source === 'fault';
        const href = isFault ? `/maintenance/faults/${row.id}` : `/maintenance/defects/${row.id}`;
        const when = row.date || row.createdAt;
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => router.push(href)}
            className="flex w-full items-center gap-3 rounded-md border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                row.severity === 'critical' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600',
              )}
            >
              <AlertCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {/* TYPE badge — differentiates fault vs defect vs inspection defect */}
                <Badge className={type.className}>{type.label}</Badge>
                <span className="text-sm font-medium text-foreground truncate">{row.name || 'Issue'}</span>
                {row.defectNumber && (
                  <span className="font-mono text-xs text-muted-foreground">#{row.defectNumber}</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                {when && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <FormattedDate value={when} />
                  </span>
                )}
                {row.workOrderNumber && (
                  <span className="inline-flex items-center gap-1">
                    <Wrench className="h-3 w-3" />
                    WO #{row.workOrderNumber}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {row.priority && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    PRIORITY_BADGE_CLASSES[row.priority] || 'bg-muted text-muted-foreground',
                  )}
                >
                  {PRIORITY_DISPLAY_NAME[row.priority] || row.priority}
                </span>
              )}
              {row.severity && (
                <Badge variant="outline" className="text-xs">
                  {SEVERITY_DISPLAY_NAME[row.severity] || row.severity}
                </Badge>
              )}
              <Badge variant={st.variant}>{st.label}</Badge>
            </div>
          </button>
        );
      })}
    </div>
  );
}
