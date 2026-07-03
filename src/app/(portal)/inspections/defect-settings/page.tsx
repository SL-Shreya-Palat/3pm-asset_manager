'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { FileCheck2, Settings2, ArrowRight, CheckCircle2, FileX2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';

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
      // Filter out Driver Wellness — it's a driver-only form, not an asset defect form.
      const filtered = mapped.filter(
        (f) => f.formTitle !== 'Driver Wellness Pre-Start Check',
      );
      // Configurable (published-schema) forms first.
      filtered.sort((a, b) => Number(b.hasSchema) - Number(a.hasSchema));
      setForms(filtered);
    } catch {
      setForms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-seed pre-start forms on first load so every tenant gets all templates
  // (including Driver Wellness) without clicking the button. The endpoint is
  // idempotent — already-seeded templates are skipped, and when all templates
  // exist the call returns immediately without hitting the form-builder API.
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      await fetchForms();
      try {
        const res = await axios.post('/api/forms/seed-prestart', {}, { withCredentials: true });
        const seeded = res.data.data?.forms?.filter(
          (f: { status: string }) => f.status === 'seeded',
        ).length ?? 0;
        // Refresh the list only if new forms were actually seeded
        if (seeded > 0 && !cancelled) {
          await fetchForms();
        }
      } catch {
        // Silent — seeding is best-effort on page load
      }
    };
    init();
    return () => { cancelled = true; };
  }, [fetchForms]);

  const configurable = forms.filter((f) => f.hasSchema).length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Defect Settings"
        description="Choose which pre-start form answers count as defects — pick a form to configure it"
      />

      <div className="flex-1 overflow-auto px-6 pb-8">
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
      <div className="flex flex-col rounded-xl border bg-card p-5 shadow-md">
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
      className="group flex flex-col rounded-xl border bg-card p-5 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileCheck2 className="h-5 w-5" />
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" /> Published
        </span>
      </div>
      <h3 className="mt-4 truncate font-semibold text-foreground">{form.formTitle}</h3>
      <p className="mt-1 text-xs text-muted-foreground">Choose which answers flag a defect.</p>
      <div className="mt-4 flex items-center gap-1.5 border-t pt-3 text-sm font-semibold text-primary">
        <Settings2 className="h-4 w-4" />
        Configure defects
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
