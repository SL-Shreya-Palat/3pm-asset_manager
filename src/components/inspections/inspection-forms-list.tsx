'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { FileCheck2, Settings2, ArrowRight, CheckCircle2, FileX2, User, Truck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface FormItem {
  id: string;
  formTitle: string;
  status: string;
  inspectionType: 'asset' | 'driver';
  /** True when the form has a published schema (required to configure defects). */
  hasSchema: boolean;
}

/**
 * Forms list for inspection (defect) settings — pick a published form to
 * configure which answers flag a defect (asset forms) or flag the driver
 * (driver forms). Rendered both on the /inspections/defect-settings route and
 * embedded in the Admin Settings → Inspections → Forms Inspection panel.
 */
export function InspectionFormsList() {
  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchForms = useCallback(async () => {
    try {
      // Auto-seed pre-start forms (idempotent — skips if already seeded)
      await axios.post('/api/forms/seed-prestart', {}, { withCredentials: true }).catch(() => {});
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
          inspectionType: (f.inspectionType as 'asset' | 'driver') || 'asset',
          hasSchema: Array.isArray(schema?.pages) && schema.pages.length > 0,
        };
      });
      // Configurable (published-schema) forms first. Both asset AND driver forms
      // are shown — each needs its bad-answer config; the type toggle/badge on the
      // card says whether a failure raises an asset defect or a driver flag.
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

  // Manual Asset/Driver toggle — optimistic, reverts on failure.
  const handleSetType = useCallback(async (id: string, inspectionType: 'asset' | 'driver') => {
    setForms((prev) => prev.map((f) => (f.id === id ? { ...f, inspectionType } : f)));
    try {
      await axios.patch(`/api/forms/${id}/inspection-type`, { inspectionType }, { withCredentials: true });
    } catch {
      const revert = inspectionType === 'asset' ? 'driver' : 'asset';
      setForms((prev) => prev.map((f) => (f.id === id ? { ...f, inspectionType: revert } : f)));
    }
  }, []);

  const configurable = forms.filter((f) => f.hasSchema).length;

  return (
    <>
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
            <FormCard key={form.id} form={form} onSetType={handleSetType} />
          ))}
        </div>
      )}
    </>
  );
}

// ─── Form card ────────────────────────────────────────────────────────────────

/** Asset/Driver segmented toggle. Stops propagation so it never navigates the card. */
function TypeToggle({
  value,
  onChange,
}: {
  value: 'asset' | 'driver';
  onChange: (t: 'asset' | 'driver') => void;
}) {
  return (
    <div
      className="inline-flex shrink-0 rounded-full border p-0.5 text-[11px] font-semibold"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {(['asset', 'driver'] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(t);
          }}
          className={cn(
            'rounded-full px-2.5 py-0.5 capitalize transition-colors',
            value === t
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function FormCard({
  form,
  onSetType,
}: {
  form: FormItem;
  onSetType: (id: string, t: 'asset' | 'driver') => void;
}) {
  const isDriver = form.inspectionType === 'driver';

  const typeRow = (
    <div className="mb-3 flex items-center justify-between gap-2">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
          isDriver
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
        )}
      >
        {isDriver ? <User className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
        {isDriver ? 'Driver inspection' : 'Asset inspection'}
      </span>
      <TypeToggle value={form.inspectionType} onChange={(t) => onSetType(form.id, t)} />
    </div>
  );

  if (!form.hasSchema) {
    return (
      <div className="flex flex-col rounded-xl border bg-card p-5 shadow-md">
        {typeRow}
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
          Publish this form in the builder to configure it.
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/inspections/forms/${form.id}/defect-settings`}
      className="group flex flex-col rounded-xl border bg-card p-5 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
    >
      {typeRow}
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileCheck2 className="h-5 w-5" />
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" /> Published
        </span>
      </div>
      <h3 className="mt-4 truncate font-semibold text-foreground">{form.formTitle}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {isDriver
          ? 'Choose which answers flag the driver as unfit for duty.'
          : 'Choose which answers flag a defect.'}
      </p>
      <div className="mt-4 flex items-center gap-1.5 border-t pt-3 text-sm font-semibold text-primary">
        <Settings2 className="h-4 w-4" />
        {isDriver ? 'Configure driver checks' : 'Configure defects'}
        <ArrowRight className="ml-auto h-4 w-4 transition-transform group-hover:translate-x-0.5" />
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
