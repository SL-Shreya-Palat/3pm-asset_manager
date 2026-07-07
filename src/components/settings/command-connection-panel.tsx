'use client';

/**
 * Settings → Connections → Command.
 *
 * Shows the tenant's Command (construction-portal) connection state and lets
 * the owner/admin connect, disconnect and import master data. Mirrors the
 * dispatch portal's Command connection panel UX.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Cable,
  CheckCircle2,
  CloudOff,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectionData {
  state: 'standalone' | 'connected' | 'degraded';
  entitled: boolean;
  connected: boolean;
  disabled: boolean;
  configured: boolean;
  authTenantId: string | null;
  lastVerifiedAt: string | null;
  impact?: {
    commandAssets: number;
    commandVendors: number;
    commandLocations: number;
    commandDrivers: number;
  };
}

interface ImportSummary {
  assets?: { created: number; updated: number; skipped: number };
  drivers?: { created: number; updated: number; skipped: number };
  vendors?: { created: number; updated: number; skipped: number };
  locations?: { created: number; updated: number; skipped: number };
}

const ENTITY_OPTIONS = [
  { key: 'assets', label: 'Assets', hint: 'Fleet assets become read-only Command records here' },
  { key: 'drivers', label: 'Staff → Drivers', hint: 'Command staff imported as drivers' },
  { key: 'vendors', label: 'Suppliers → Vendors', hint: 'Business contacts with supplier role' },
  { key: 'locations', label: 'Locations', hint: 'Company locations' },
  { key: 'stock', label: 'Stock', hint: 'Command stock items — consumption pushes transactions back to Command' },
] as const;

type EntityKey = (typeof ENTITY_OPTIONS)[number]['key'];

/** Maintenance-history entities (batched; run after the master-data import). */
const HISTORY_ENTITIES = [
  { key: 'servicePlans', label: 'Service plans (with schedules)' },
  { key: 'serviceHistory', label: 'Servicing history' },
  { key: 'inspections', label: 'Pre-start history' },
  { key: 'workOrders', label: 'Workshop → Work orders' },
] as const;

type HistoryKey = (typeof HISTORY_ENTITIES)[number]['key'];

export function CommandConnectionPanel() {
  const [data, setData] = useState<ConnectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [selected, setSelected] = useState<Set<EntityKey>>(
    new Set(ENTITY_OPTIONS.map((e) => e.key)),
  );
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const [historyRunning, setHistoryRunning] = useState(false);
  const [historyProgress, setHistoryProgress] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/command/connection');
      const body = await res.json();
      if (body.error) setError(body.error);
      else setData(body.data);
    } catch {
      setError('Failed to load connection state');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: 'connect' | 'disconnect' | 'recheck') => {
    setActing(action);
    setError(null);
    try {
      const res = await fetch('/api/command/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (body.error) setError(body.error);
      else setData((prev) => ({ ...(prev ?? body.data), ...body.data }));
    } catch {
      setError('Request failed');
    } finally {
      setActing(null);
      setConfirmDisconnect(false);
    }
  };

  const runImport = async () => {
    setImporting(true);
    setImportResult(null);
    setError(null);
    try {
      const res = await fetch('/api/command/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entities: Array.from(selected) }),
      });
      const body = await res.json();
      if (body.error) setError(body.error);
      else setImportResult(body.data);
    } catch {
      setError('Import failed');
    } finally {
      setImporting(false);
    }
  };

  const runHistoryImport = async () => {
    setHistoryRunning(true);
    setError(null);
    setHistoryProgress({});
    try {
      for (const entity of HISTORY_ENTITIES) {
        let cursor: number | null = 1;
        let created = 0;
        let processed = 0;
        const errors: string[] = [];
        // Loop batches until this entity reports done.
        while (cursor !== null) {
          setHistoryProgress((prev) => ({
            ...prev,
            [entity.key]: `running — ${processed} processed…`,
          }));
          const res: Response = await fetch('/api/command/import-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity: entity.key as HistoryKey, cursor }),
          });
          const body: {
            data: {
              processed?: number;
              created?: number;
              errors?: string[];
              nextCursor?: number | null;
              done?: boolean;
            } | null;
            error: string | null;
          } = await res.json();
          if (body.error || !body.data) {
            errors.push(body.error || 'batch failed');
            break;
          }
          processed += body.data.processed ?? 0;
          created += body.data.created ?? 0;
          if (Array.isArray(body.data.errors)) errors.push(...body.data.errors.slice(0, 3));
          cursor = body.data.done ? null : (body.data.nextCursor ?? null);
        }
        setHistoryProgress((prev) => ({
          ...prev,
          [entity.key]: `${created} imported of ${processed} processed${errors.length ? ` — ${errors[0]}` : ''}`,
        }));
      }
    } catch {
      setError('History import failed — re-run to resume (already-imported records are skipped).');
    } finally {
      setHistoryRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading connection…
      </div>
    );
  }

  const state = data?.state ?? 'standalone';
  const impactCount = data?.impact
    ? data.impact.commandAssets +
      data.impact.commandVendors +
      data.impact.commandLocations +
      data.impact.commandDrivers
    : 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Command connection</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          When connected, Command (construction portal) is the master source for assets,
          staff, suppliers and locations — and Drive pushes meter readings,
          compliance dates and out-of-service status back to Command.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Status card */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {state === 'connected' && <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />}
            {state === 'degraded' && <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />}
            {state === 'standalone' && <CloudOff className="mt-0.5 h-5 w-5 text-muted-foreground" />}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {state === 'connected' && 'Connected to Command'}
                  {state === 'degraded' && 'Connected — Command unreachable'}
                  {state === 'standalone' && 'Standalone'}
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-medium',
                    state === 'connected' && 'bg-emerald-100 text-emerald-700',
                    state === 'degraded' && 'bg-amber-100 text-amber-700',
                    state === 'standalone' && 'bg-muted text-muted-foreground',
                  )}
                >
                  {state}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {!data?.configured &&
                  'Command is not configured on this server (COMMAND_BASE_URL missing). All data stays local.'}
                {data?.configured && state === 'standalone' && data.disabled &&
                  'The connection was turned off by an admin. Command-sourced records stay usable locally.'}
                {data?.configured && state === 'standalone' && !data.disabled && !data.entitled &&
                  'This organisation has no active Command subscription, so Drive runs fully standalone.'}
                {data?.configured && state === 'standalone' && !data.disabled && data.entitled &&
                  'Entitled but not connected yet — click Connect to enable live Command data.'}
                {state === 'connected' &&
                  'Master data reads and write-backs to Command are active for this organisation.'}
                {state === 'degraded' &&
                  'Command is currently unreachable. Imported records remain usable; write-backs are queued and replayed automatically.'}
              </p>
              {data?.lastVerifiedAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Subscription last verified {new Date(data.lastVerifiedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => act('recheck')}
              disabled={acting !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/50 disabled:opacity-50"
            >
              {acting === 'recheck' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Re-check
            </button>
            {data?.configured && (state === 'connected' || state === 'degraded') && (
              <button
                onClick={() => setConfirmDisconnect(true)}
                disabled={acting !== null}
                className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                Disconnect
              </button>
            )}
            {data?.configured && state === 'standalone' && (data.disabled || data.entitled) && (
              <button
                onClick={() => act('connect')}
                disabled={acting !== null}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {acting === 'connect' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Cable className="h-3.5 w-3.5" />
                )}
                Connect
              </button>
            )}
          </div>
        </div>

        {/* Disconnect confirmation */}
        {confirmDisconnect && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">Disconnect from Command?</p>
            <p className="mt-1 text-sm text-amber-800">
              {impactCount > 0
                ? `${impactCount} Command-sourced records (assets, drivers, vendors, locations) stay usable locally but will stop refreshing, and write-backs to Command will stop.`
                : 'Live Command reads and write-backs will stop. You can reconnect at any time.'}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => act('disconnect')}
                disabled={acting !== null}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
              >
                {acting === 'disconnect' ? 'Disconnecting…' : 'Yes, disconnect'}
              </button>
              <button
                onClick={() => setConfirmDisconnect(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Import card — only when connected */}
      {state === 'connected' && (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Import master data from Command</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Imports are idempotent — re-running refreshes Command-sourced records without
            creating duplicates. Command-owned identity fields stay read-only here.
          </p>

          <div className="mt-4 space-y-2">
            {ENTITY_OPTIONS.map((opt) => (
              <label key={opt.key} className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(opt.key)}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(opt.key);
                      else next.delete(opt.key);
                      return next;
                    });
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <button
            onClick={runImport}
            disabled={importing || selected.size === 0}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {importing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" /> Import selected
              </>
            )}
          </button>

          {importResult && (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              {(Object.entries(importResult) as Array<[string, { created: number; updated: number; skipped: number }]>).map(
                ([entity, r]) => (
                  <div key={entity}>
                    <span className="font-medium capitalize">{entity}</span>: {r.created} created,{' '}
                    {r.updated} updated, {r.skipped} skipped
                  </div>
                ),
              )}
            </div>
          )}

          {/* Maintenance history (Zoho → Command → here). Runs in resumable
              batches; already-imported records are skipped, so re-running is safe. */}
          <div className="mt-6 border-t border-border pt-4">
            <h4 className="text-sm font-semibold text-foreground">
              Import maintenance history
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Brings Command&apos;s service plans, servicing history, pre-start history and
              workshop job cards into Drive (zero data loss — run after importing
              assets). Safe to re-run; it resumes and never duplicates.
            </p>
            <button
              onClick={runHistoryImport}
              disabled={historyRunning}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50"
            >
              {historyRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing history…
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" /> Import history
                </>
              )}
            </button>
            {Object.keys(historyProgress).length > 0 && (
              <div className="mt-3 space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
                {HISTORY_ENTITIES.map((e) =>
                  historyProgress[e.key] ? (
                    <div key={e.key} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{e.label}</span>
                      <span className="text-foreground">{historyProgress[e.key]}</span>
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
