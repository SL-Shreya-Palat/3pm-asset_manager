'use client';

/**
 * Admin screen to configure the IoT Hub integration for the tenant.
 * Enable telematics providers + enter their auth keys, optionally link an
 * existing hub Client ID, then pull devices into Assets with "Sync now".
 * Backed by /api/settings/iot (GET/PUT) and /api/settings/iot/sync (POST).
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Save, RefreshCw, Info, CheckCircle2, AlertTriangle, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

const PROVIDERS = [
  { key: 'EROAD', label: 'EROAD' },
  { key: 'NAVMAN', label: 'Navman' },
  { key: 'BLACKHAWK', label: 'Blackhawk' },
  { key: 'CARTRACK', label: 'Cartrack' },
] as const;

interface SyncResult {
  success: boolean;
  totalDevices: number;
  created: number;
  updated: number;
  complianceCreated: number;
  complianceUpdated: number;
  errors: string[];
}

export function IoTSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [providers, setProviders] = useState<Set<string>>(new Set());
  const [keys, setKeys] = useState({
    eroad: '',
    navman: '',
    blackhawk: '',
    cartrack: '',
    cartrackUser: '',
  });
  const [iotClientId, setIotClientId] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await axios.get('/api/settings/iot', { withCredentials: true });
      const d = res.data.data;
      if (!d) return;
      setProviders(new Set(d.providerNames || []));
      setKeys({
        eroad: d.eroadAuthorizationKey || '',
        navman: d.navmanAuthorizationKey || '',
        blackhawk: d.blackhawkAuthorizationKey || '',
        cartrack: d.cartrackAuthorizationKey || '',
        cartrackUser: d.cartrackAuthorizationUsername || '',
      });
      setIotClientId(d.iotClientId || '');
      setAutoSync(!!d.autoSyncEnabled);
      setLastSyncedAt(d.lastSyncedAt || null);
    } catch {
      setError('Failed to load IoT settings');
    } finally {
      setLoading(false);
    }
  }, []);

  // Defer so setState isn't called synchronously inside the effect body.
  useEffect(() => {
    const t = setTimeout(() => fetchSettings(), 0);
    return () => clearTimeout(t);
  }, [fetchSettings]);

  const toggleProvider = (key: string) => {
    setSuccess('');
    setProviders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const payload = {
        providerNames: [...providers],
        eroadAuthorizationKey: keys.eroad,
        navmanAuthorizationKey: keys.navman,
        blackhawkAuthorizationKey: keys.blackhawk,
        cartrackAuthorizationKey: keys.cartrack,
        cartrackAuthorizationUsername: keys.cartrackUser,
        iotClientId: iotClientId.trim() || undefined,
        autoSyncEnabled: autoSync,
      };
      const res = await axios.put('/api/settings/iot', payload, { withCredentials: true });
      if (res.data.error) {
        setError(res.data.error);
        return;
      }
      setSuccess('IoT settings saved.');
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : 'Failed to save';
      setError(msg || 'Failed to save IoT settings');
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    try {
      setSyncing(true);
      setError('');
      setSyncResult(null);
      const res = await axios.post('/api/settings/iot/sync', {}, { withCredentials: true });
      setSyncResult(res.data.data);
      // Refresh last-synced timestamp.
      fetchSettings();
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : 'Sync failed';
      setError(msg || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Radio className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">IoT Hub</h2>
          <p className="text-sm text-muted-foreground">
            Connect telematics providers to pull live GPS, odometer and engine-hour readings into your assets.
          </p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {success}
        </div>
      )}

      {/* Providers */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Providers</h3>
          <p className="text-xs text-muted-foreground">Enable each provider you use and enter its authorization key.</p>
        </div>
        <div className="divide-y">
          {PROVIDERS.map((p) => {
            const enabled = providers.has(p.key);
            return (
              <div key={p.key} className="px-4 py-3">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <Checkbox checked={enabled} onCheckedChange={() => toggleProvider(p.key)} />
                  <span className="text-sm font-medium text-foreground">{p.label}</span>
                </label>
                {enabled && (
                  <div className="mt-3 space-y-2 pl-7">
                    <Input
                      value={
                        p.key === 'EROAD'
                          ? keys.eroad
                          : p.key === 'NAVMAN'
                            ? keys.navman
                            : p.key === 'BLACKHAWK'
                              ? keys.blackhawk
                              : keys.cartrack
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setSuccess('');
                        setKeys((k) => ({
                          ...k,
                          ...(p.key === 'EROAD'
                            ? { eroad: v }
                            : p.key === 'NAVMAN'
                              ? { navman: v }
                              : p.key === 'BLACKHAWK'
                                ? { blackhawk: v }
                                : { cartrack: v }),
                        }));
                      }}
                      placeholder={`${p.label} authorization key`}
                    />
                    {p.key === 'CARTRACK' && (
                      <Input
                        value={keys.cartrackUser}
                        onChange={(e) => {
                          setSuccess('');
                          setKeys((k) => ({ ...k, cartrackUser: e.target.value }));
                        }}
                        placeholder="Cartrack username"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Advanced */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Advanced</h3>
        </div>
        <div className="space-y-4 px-4 py-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">IoT Hub Client ID</label>
            <Input
              value={iotClientId}
              onChange={(e) => {
                setSuccess('');
                setIotClientId(e.target.value);
              }}
              placeholder="Leave blank to create automatically on first sync"
            />
            <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Only set this to link an organization that already exists in the IoT Hub.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5">
            <Checkbox checked={autoSync} onCheckedChange={(c) => { setSuccess(''); setAutoSync(!!c); }} />
            <span className="text-sm text-foreground">
              Enable automatic hourly sync
              <span className="ml-1 text-xs text-muted-foreground">(requires the scheduled job to be running)</span>
            </span>
          </label>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save settings
        </Button>
      </div>

      {/* Sync */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Sync devices</h3>
            <p className="text-xs text-muted-foreground">
              {lastSyncedAt
                ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}`
                : 'Never synced yet'}
            </p>
          </div>
          <Button variant="outline" onClick={syncNow} disabled={syncing || providers.size === 0}>
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} /> Sync now
          </Button>
        </div>
        {syncResult && (
          <div className="px-4 py-3 text-sm">
            <p className="text-foreground">
              {syncResult.totalDevices} device{syncResult.totalDevices === 1 ? '' : 's'} fetched ·{' '}
              <span className="font-medium text-emerald-600">{syncResult.created} created</span> ·{' '}
              <span className="font-medium text-primary">{syncResult.updated} updated</span>
            </p>
            {(syncResult.complianceCreated > 0 || syncResult.complianceUpdated > 0) && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Compliance (rego/WOF/COF): {syncResult.complianceCreated} created ·{' '}
                {syncResult.complianceUpdated} updated
              </p>
            )}
            {syncResult.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-destructive">
                  {syncResult.errors.length} error{syncResult.errors.length === 1 ? '' : 's'}
                </summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {syncResult.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
