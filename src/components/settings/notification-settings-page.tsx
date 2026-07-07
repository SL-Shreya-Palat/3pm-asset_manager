'use client';

/**
 * Admin screen to decide who receives each notification, using a SCOPE × ROLES model:
 *   1. Scope  — Responsible team / Whole company / No one.
 *   2. Roles  — which role(s) within that scope (Managers, Mechanics, Drivers, …).
 * e.g. "only the mechanic on the asset's team" = scope Responsible team + role Mechanic.
 * A live preview sentence spells out exactly who gets alerted.
 * Saved as one config doc per tenant (see /api/notification-settings).
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Save, Info, Users, Bell, Check } from 'lucide-react';
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
type Scope = 'team' | 'company' | 'off';
type NotifyRole = 'admin' | 'manager' | 'team_manager' | 'mechanic' | 'driver';
interface Rule {
  scope: Scope;
  roles: NotifyRole[];
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

const DEFAULT_RULE: Rule = { scope: 'company', roles: ['manager'] };

const ROLE_OPTIONS: { value: NotifyRole; label: string }[] = [
  { value: 'manager', label: 'Managers' },
  { value: 'mechanic', label: 'Mechanics' },
  { value: 'driver', label: 'Drivers' },
  { value: 'team_manager', label: 'Team Managers' },
  { value: 'admin', label: 'Admins' },
];
const ROLE_LABEL: Record<NotifyRole, string> = {
  manager: 'managers',
  mechanic: 'mechanics',
  driver: 'drivers',
  team_manager: 'team managers',
  admin: 'admins',
};

/** "managers", "managers and mechanics", "mechanics, managers and admins". */
function humanRoles(roles: NotifyRole[]): string {
  if (roles.length === 0) return 'everyone';
  const labels = roles.map((r) => ROLE_LABEL[r]);
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** Plain-English summary of a rule — shown live under each event. */
function describeRule(rule: Rule): string {
  if (rule.scope === 'off') return 'No notifications are sent.';
  const who = humanRoles(rule.roles);
  return rule.scope === 'company'
    ? `Notifies ${who} across the company.`
    : `Notifies ${who} on the asset's responsible team.`;
}

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

  function setScope(type: string, scope: Scope) {
    patchRule(type, { scope });
  }

  function toggleRole(type: string, role: NotifyRole) {
    const current = rules[type]?.roles ?? [];
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    patchRule(type, { roles: next });
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
    const rule = rules[event.type] ?? DEFAULT_RULE;
    const showRoles = rule.scope !== 'off';

    return (
      <div
        key={event.type}
        className="flex flex-col gap-3 rounded-sm border border-border bg-card px-4 py-3 lg:flex-row lg:items-start lg:gap-4"
      >
        {/* Left: label + description + live preview */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{event.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
          <p className="mt-1 text-xs font-medium text-primary/90">→ {describeRule(rule)}</p>
        </div>

        {/* Right: scope + role picker */}
        <div className="flex flex-col gap-2 lg:items-end">
          <Select value={rule.scope} onValueChange={(v) => setScope(event.type, v as Scope)}>
            <SelectTrigger className="h-9 w-48 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {event.teamScoped && <SelectItem value="team">Responsible team</SelectItem>}
              <SelectItem value="company">Whole company</SelectItem>
              <SelectItem value="off">No one</SelectItem>
            </SelectContent>
          </Select>

          {showRoles && (
            <div className="flex max-w-md flex-wrap items-center gap-1.5 lg:justify-end">
              {ROLE_OPTIONS.map((ro) => {
                const on = rule.roles.includes(ro.value);
                return (
                  <button
                    key={ro.value}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggleRole(event.type, ro.value)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      on
                        ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border-border bg-background text-foreground/70 hover:border-foreground/30 hover:text-foreground',
                    )}
                  >
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    {ro.label}
                  </button>
                );
              })}
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
            For each event, choose how wide to notify and which roles should hear about it.
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

      {/* How it works — plain language */}
      <div className="flex gap-3 rounded-sm border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/40">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <div className="space-y-1 text-blue-800/90 dark:text-blue-300/90">
          <p className="font-medium text-blue-900 dark:text-blue-200">How each alert is routed</p>
          <p className="leading-relaxed">
            First pick <span className="font-medium">how wide</span> — the asset&apos;s{' '}
            <span className="font-medium">Responsible team</span>, the{' '}
            <span className="font-medium">Whole company</span>, or <span className="font-medium">No one</span>.
            Then tick <span className="font-medium">which roles</span> should get it. Only people who match{' '}
            <span className="font-medium">both</span> are notified — so &quot;Responsible team + Mechanics&quot;
            reaches just the mechanic on that asset&apos;s team. Tick no roles to notify everyone in the scope.
          </p>
          <p className="leading-relaxed">
            <span className="font-medium">If an asset has no team yet</span>, the alert automatically goes to the
            same roles <span className="font-medium">across the whole company</span> (and to your managers/owner if
            no one matches) so nothing is ever missed. Assign assets to teams on the{' '}
            <span className="font-medium">Teams</span> page, and set each member&apos;s role under People.
          </p>
        </div>
      </div>

      {/* Asset & team events */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Asset, team &amp; driver events
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
