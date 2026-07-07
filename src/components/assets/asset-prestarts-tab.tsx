'use client';

/**
 * Asset Inspections tab — the inspection / pre-start submissions logged against a
 * single asset. Mirrors Command's inspections view: an asset-scoped, read-only
 * list backed by the shared inspection-submissions API (filtered by assetId).
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, XCircle, ClipboardCheck, User, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface PrestartRow {
  id: string;
  inspectionNumber: string | null;
  formTitle: string;
  operatorName: string | null;
  result: string;
  defectCount: number;
  submittedAt: string | null;
}

export function AssetPrestartsTab({ assetId }: { assetId: string }) {
  const [rows, setRows] = useState<PrestartRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `/api/inspection-submissions?assetId=${assetId}&limit=50`,
        { withCredentials: true },
      );
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
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-foreground">No inspections yet</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Completed inspections for this asset will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const passed = row.result !== 'fail';
        return (
          <div
            key={row.id}
            className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
          >
            <span
              className={
                passed
                  ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600'
                  : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600'
              }
            >
              {passed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground truncate">
                  {row.formTitle || 'Inspection'}
                </span>
                {row.inspectionNumber && (
                  <span className="font-mono text-xs text-muted-foreground">
                    #{row.inspectionNumber}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                {row.operatorName && (
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {row.operatorName}
                  </span>
                )}
                {row.submittedAt && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(row.submittedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {row.defectCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  {row.defectCount} defect{row.defectCount !== 1 ? 's' : ''}
                </Badge>
              )}
              <Badge
                className={
                  passed
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-red-100 text-red-700 hover:bg-red-100'
                }
              >
                {passed ? 'Passed' : 'Failed'}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
