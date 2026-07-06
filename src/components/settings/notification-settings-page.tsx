'use client';

/**
 * Admin screen to route each notification event to the right people.
 * One row per configurable event: pick an audience (Assigned team / All managers /
 * Off); for team routing, choose which team roles receive it and whether Admins
 * are always CC'd. Saved as one config doc per tenant (see /api/notification-settings).
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Save, Info, Users, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

// ── local types (mirror the server config; kept local so no server code bundles) ──
type Audience = 'team' | 'all_managers' | 'off';
type TeamRole = 'managing' | 'following';
interface Rule {
  audience: Audience;
  teamRoles: TeamRole[];
  ccAdmins: boolean;
}
interface EventMeta {
  type: string;
  label: string;
  description: string;
  teamScoped: boolean;
}
interface SettingsData {
  events: EventMeta[];
  rules: Record<string, Rule>;
}

const TEAM_ROLES: { value: TeamRole; label: string }[] = [
  { value: 'managing', label: 'Managing' },
  { value: 'following', label: 'Following' },
];

export function NotificationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [events, setEvents] = useState<EventMeta[]>([]);
  const [rules, setRules] = useState<Record<string, Rule>>({});

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await axios.get<{ data: SettingsData; error: string | null }>(
        '/api/notification-settings',
        { withCredentials: true },
      );
      if (res.data.error) {
        setError(res.data.error);
        return;
      }
      setEvents(res.data.data.events);
      setRules(res.data.data.rules);
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : 'Failed to load settings';
      setError(msg || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // ── edits ─────────────────────────────────────────────────────────────────
  function patchRule(type: string, patch: Partial<Rule>) {
    setRules((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
    setSuccess('');
  }

  function setAudience(type: string, audience: Audience) {
    patchRule(type, { audience });
  }

  function toggleTeamRole(type: string, role: TeamRole) {
    const current = rules[type]?.teamRoles ?? [];
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    // Never allow zero roles — a team rule with no roles notifies nobody.
    patchRule(type, { teamRoles: next.length > 0 ? next : current });
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await axios.put('/api/notification-settings', { rules }, { withCredentials: true });
      setSuccess('Notification settings saved');
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : 'Failed to save';
      setError(msg || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const teamEvents = events.filter((e) => e.teamScoped);
  const otherEvents = events.filter((e) => !e.teamScoped);

  const renderRow = (event: EventMeta) => {
    const rule = rules[event.type] ?? { audience: 'all_managers', teamRoles: ['managing', 'following'], ccAdmins: true };
    const isTeam = rule.audience === 'team';

    return (
      <div
        key={event.type}
        className="flex flex-col gap-3 rounded-sm border border-border bg-card px-4 py-3 md:flex-row md:items-center md:gap-4"
      >
        {/* Left: label + description */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{event.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
        </div>

        {/* Right: routing controls */}
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Select value={rule.audience} onValueChange={(v) => setAudience(event.type, v as Audience)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {event.teamScoped && <SelectItem value="team">Assigned team</SelectItem>}
              <SelectItem value="all_managers">All managers</SelectItem>
              <SelectItem value="off">Off</SelectItem>
            </SelectContent>
          </Select>

          {isTeam && (
            <div className="flex items-center gap-1.5 md:border-l md:border-border/70 md:pl-2.5">
              {TEAM_ROLES.map((tr) => {
                const on = rule.teamRoles.includes(tr.value);
                return (
                  <button
                    key={tr.value}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggleTeamRole(event.type, tr.value)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      on
                        ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border-border bg-background text-foreground/70 hover:border-foreground/30 hover:text-foreground',
                    )}
                  >
                    {tr.label}
                  </button>
                );
              })}
              <button
                type="button"
                role="checkbox"
                aria-checked={rule.ccAdmins}
                onClick={() => patchRule(event.type, { ccAdmins: !rule.ccAdmins })}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  rule.ccAdmins
                    ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-border bg-background text-muted-foreground hover:border-blue-300 hover:text-blue-600',
                )}
                title="Always also notify Admins/Owner"
              >
                CC Admins
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Bell className="h-5 w-5 text-primary" />
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground">
            Decide who receives each alert. Route asset events to the responsible team instead of every manager.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="shrink-0">
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-sm border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-sm border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
          {success}
        </div>
      )}

      {/* How it works */}
      <div className="flex gap-3 rounded-sm border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/40">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <div>
          <p className="font-medium text-blue-900 dark:text-blue-200">How routing works</p>
          <p className="mt-0.5 leading-relaxed text-blue-800/90 dark:text-blue-300/90">
            <span className="font-medium">Assigned team</span> sends only to the team(s) that own the asset —
            set who&apos;s <span className="font-medium">Managing</span>/<span className="font-medium">Following</span>{' '}
            on each team&apos;s Users tab. <span className="font-medium">CC Admins</span> always also notifies
            Admins/Owner. If an asset has no team, the alert falls back to all managers so nothing is missed.
          </p>
        </div>
      </div>

      {/* Asset & team events */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Asset &amp; team events
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="space-y-2">{teamEvents.map(renderRow)}</div>
      </section>

      {/* Inventory events (no team) */}
      {otherEvents.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inventory events</h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-2">{otherEvents.map(renderRow)}</div>
        </section>
      )}

      {/* Sticky save footer */}
      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-sm border bg-card/95 px-4 py-3 text-sm shadow-lg backdrop-blur supports-backdrop-filter:bg-card/80">
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
