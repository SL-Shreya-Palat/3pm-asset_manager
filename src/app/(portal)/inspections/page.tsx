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
  formId?: string;
  formTitle?: string;
  title?: string;
  status: string;
}

export default function InspectionsPage() {
  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchForms = useCallback(async () => {
    try {
      const res = await axios.get('/api/forms?status=published', { withCredentials: true });
      const items = res.data.data?.items || [];
      setForms(
        items.map((f: Record<string, unknown>) => ({
          id: (f.formId as string) || (f.id as string),
          formTitle: (f.formTitle as string) || (f.title as string) || '',
          status: (f.status as string) || 'draft',
        })),
      );
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
        `Synced ${data.synced} submission(s), ${data.defectsCreated} defect(s) created.`,
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
          <h1 className="text-2xl font-semibold text-foreground">Inspections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage vehicle inspections and compliance
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

      <h2 className="mt-8 text-lg font-medium">Pre-Start Forms</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Published forms available for inspection. Configure which answers trigger defects.
      </p>

      {loading ? (
        <div className="mt-6 flex justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      ) : forms.length === 0 ? (
        <div className="mt-6 flex h-32 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          No published forms found
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <div
              key={form.id}
              className="rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <FileCheck2 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">
                    {form.formTitle || 'Untitled Form'}
                  </h3>
                  <Badge variant="success" className="mt-1">
                    {form.status}
                  </Badge>
                </div>
              </div>
              <div className="mt-4">
                <Link href={`/inspections/forms/${form.id}/defect-settings`}>
                  <Button variant="outline" size="sm" className="w-full">
                    <Settings2 className="mr-2 h-4 w-4" />
                    Defect Settings
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
