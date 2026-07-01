'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { FileCheck2, Settings2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

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
  const [syncResult, setSyncResult] = useState<string | null>(null);

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
      setSyncResult(
        `Found ${data.totalFound ?? 0} submission(s) · processed ${data.synced} new · ${data.defectsCreated} defect(s) created.`,
      );
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : 'Sync failed';
      setSyncResult(`Error: ${msg || 'Sync failed'}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Defect Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which pre-start form answers count as defects — pick a form below to configure it.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncSubmissions}
          disabled={syncing}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Submissions'}
        </Button>
      </div>

      {syncResult && (
        <div
          className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            syncResult.startsWith('Error')
              ? 'border-destructive/50 bg-destructive/10 text-destructive'
              : 'border-green-200 bg-green-50 text-green-800'
          }`}
        >
          {syncResult}
        </div>
      )}

      <h2 className="mt-8 text-lg font-medium">Your Forms</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every form synced from the form builder. Open a published form to choose which answers create defects.
      </p>

      {loading ? (
        <div className="mt-6 flex justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      ) : forms.length === 0 ? (
        <div className="mt-6 flex h-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center text-muted-foreground">
          <p>No forms found yet.</p>
          <p className="text-xs">Create and publish a form in the form builder, then it appears here.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <div
              key={form.id}
              className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <FileCheck2 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">{form.formTitle}</h3>
                  <Badge variant={form.hasSchema ? 'success' : 'secondary'} className="mt-1 capitalize">
                    {form.status}
                  </Badge>
                </div>
              </div>
              <div className="mt-4">
                {form.hasSchema ? (
                  <Link href={`/inspections/forms/${form.id}/defect-settings`}>
                    <Button variant="outline" size="sm" className="w-full">
                      <Settings2 className="mr-2 h-4 w-4" />
                      Configure Defects
                    </Button>
                  </Link>
                ) : (
                  <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    Publish this form in the builder to configure defects.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
