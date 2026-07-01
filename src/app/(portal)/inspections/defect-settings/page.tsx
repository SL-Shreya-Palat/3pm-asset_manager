'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { FileCheck2, Settings2, RefreshCw, ArrowRight, CheckCircle2, AlertCircle, FileX2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

interface FormItem {
  id: string;
  formTitle: string;
  status: string;
  /** True when the form has a published schema (required to configure defects). */
  hasSchema: boolean;
}

export default function DefectSettingsListPage() {
  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchForms = useCallback(async () => {
    try {
      // Fetch ALL forms (any status) so nothing from the builder is hidden — the
      // builder's `status` string isn't a fixed enum, so we don't filter on it.
      const res = await axios.get('/api/forms', { withCredentials: true });
      const items = res.data.data?.items || [];
      const mapped: FormItem[] = items.map((f: Record<string, unknown>) => {
        const schema = (f.currentSchema || f.publishedSchema) as { pages?: unknown[] } | null;
        return {
          id: (f.formId as string) || (f.id as string),
          formTitle: (f.formTitle as string) || (f.title as string) || 'Untitled Form',
          status: (f.status as string) || 'draft',
          hasSchema: Array.isArray(schema?.pages) && schema.pages.length > 0,
        };
      });
      // Configurable (published-schema) forms first.
      mapped.sort((a, b) => Number(b.hasSchema) - Number(a.hasSchema));
      setForms(mapped);
    } catch {
      setForms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  const handleSyncSubmissions = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await axios.post('/api/forms/sync-submissions', {}, { withCredentials: true });
      const data = res.data.data;
      setSyncResult({
        ok: true,
        message: `Found ${data.totalFound ?? 0} submission(s) · processed ${data.synced} new · ${data.defectsCreated} defect(s) created.`,
      });
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : 'Sync failed';
      setSyncResult({ ok: false, message: msg || 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  const configurable = forms.filter((f) => f.hasSchema).length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Defect Settings"
        description="Choose which pre-start form answers count as defects — pick a form to configure it"
      >
        <Button variant="outline" size="sm" onClick={handleSyncSubmissions} disabled={syncing}>
          <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
          {syncing ? 'Syncing...' : 'Sync Submissions'}
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto px-6 pb-8">
        {syncResult && (
          <div
            className={cn(
              'mb-5 flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm',
              syncResult.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-destructive/40 bg-destructive/10 text-destructive',
            )}
          >
            {syncResult.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{syncResult.message}</span>
          </div>
        )}

        {/* Section heading */}
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your forms</h2>
          {!loading && (
            <span className="rounded-full border bg-card px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
              {configurable}/{forms.length} configurable
            </span>
          )}
          <div className="h-px flex-1 bg-border" />
        </div>

        {loading ? (
          <CardGridSkeleton />
        ) : forms.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {forms.map((form) => (
              <FormCard key={form.id} form={form} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Form card ────────────────────────────────────────────────────────────────

function FormCard({ form }: { form: FormItem }) {
  if (!form.hasSchema) {
    return (
      <div className="flex flex-col rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <FileX2 className="h-5 w-5" />
          </span>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold capitalize text-muted-foreground">
            {form.status}
          </span>
        </div>
        <h3 className="mt-4 truncate font-semibold text-foreground">{form.formTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Publish this form in the builder to configure its defects.
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/inspections/forms/${form.id}/defect-settings`}
      className="group flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-foreground/70">
          <FileCheck2 className="h-5 w-5" />
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" /> Published
        </span>
      </div>
      <h3 className="mt-4 truncate font-semibold text-foreground">{form.formTitle}</h3>
      <p className="mt-1 text-xs text-muted-foreground">Choose which answers flag a defect.</p>
      <div className="mt-4 flex items-center gap-1.5 border-t pt-3 text-sm font-semibold text-foreground">
        <Settings2 className="h-4 w-4 text-muted-foreground" />
        Configure defects
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

// ─── States ─────────────────────────────────────────────────────────────────

function CardGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-4 h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-32" />
          <Skeleton className="mt-4 h-5 w-28" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileX2 className="h-7 w-7" />
      </span>
      <p className="mt-4 text-base font-semibold text-foreground">No forms yet</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Create and publish a pre-start form in the form builder — it will appear here so you can pick which answers create defects.
      </p>
    </div>
  );
}
