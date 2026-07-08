'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Download, Users, Cable } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RoleOption } from './types';

interface DirectoryItem {
  id: string;
  name: string;
  email: string | null;
  alreadyMember: boolean;
  alreadyInvited: boolean;
  invitable: boolean;
}

interface ImportSummary {
  invited: number;
  skippedNoEmail: number;
  skippedAlreadyMember: number;
  failed: number;
  errors: string[];
}

/**
 * Import Command staff as Asset Manager members. Lists the tenant's Command
 * staff with their current status (member / invited / no email) and invites the
 * selected ones with a chosen role — each becomes a login on accept.
 */
export function ImportCommandStaffDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [roleId, setRoleId] = useState<string>('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSummary(null);
    setSelected(new Set());
    (async () => {
      try {
        const res = await axios.get('/api/users/command-directory', { withCredentials: true });
        const list = (res.data?.data?.items ?? []) as DirectoryItem[];
        setItems(list);
        // Pre-select everyone invitable and not already invited.
        setSelected(new Set(list.filter((i) => i.invitable && !i.alreadyInvited).map((i) => i.id)));
      } catch (err: unknown) {
        setError(
          axios.isAxiosError(err) && err.response?.data?.error
            ? String(err.response.data.error)
            : "Couldn't load Command staff",
        );
      } finally {
        setLoading(false);
      }
    })();
    (async () => {
      try {
        const res = await axios.get('/api/roles?limit=100', { withCredentials: true });
        const list = ((res.data?.data?.items ?? []) as (RoleOption & { isActive?: boolean })[])
          .filter((r) => r.isActive !== false)
          .map((r) => ({ id: r.id, name: r.name }));
        setRoles(list);
        // Default to a Member/Staff role when present, else the first role.
        const fallback =
          list.find((r) => ['member', 'staff'].includes(r.name.toLowerCase())) ?? list[0];
        setRoleId(fallback?.id ?? '');
      } catch {
        setRoles([]);
      }
    })();
  }, [open]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function doImport() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await axios.post(
        '/api/users/import-command',
        { ids: [...selected], roleId: roleId || undefined },
        { withCredentials: true },
      );
      const s = res.data?.data as ImportSummary;
      setSummary(s);
      onImported();
    } catch (err: unknown) {
      setError(
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : 'Import failed',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const invitableCount = items.filter((i) => i.invitable).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cable className="h-4 w-4 text-blue-600" />
            Import staff from Command
          </DialogTitle>
          <DialogDescription>
            Invite your Command staff as members. Each selected person gets an email invite and
            becomes assignable once they accept and sign in.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {summary ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">Import complete</p>
            <ul className="mt-1 space-y-0.5">
              {summary.invited > 0 && <li>{summary.invited} invited</li>}
              {summary.skippedAlreadyMember > 0 && <li>{summary.skippedAlreadyMember} already members</li>}
              {summary.skippedNoEmail > 0 && <li>{summary.skippedNoEmail} skipped (no email)</li>}
              {summary.failed > 0 && <li className="text-destructive">{summary.failed} failed</li>}
            </ul>
            {summary.errors.length > 0 && (
              <ul className="mt-2 list-disc pl-4 text-xs text-destructive">
                {summary.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="max-h-80 overflow-y-auto rounded-sm border">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading Command staff…
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
                  <Users className="h-5 w-5" />
                  No staff found in Command.
                </div>
              ) : (
                <ul className="divide-y">
                  {items.map((it) => {
                    const disabled = !it.invitable;
                    return (
                      <li key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                        <Checkbox
                          checked={selected.has(it.id)}
                          disabled={disabled}
                          onCheckedChange={() => toggle(it.id)}
                          aria-label={`Select ${it.name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{it.name || 'Unnamed'}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {it.email ?? 'No email on file'}
                          </div>
                        </div>
                        {it.alreadyMember ? (
                          <Badge variant="secondary">Member</Badge>
                        ) : it.alreadyInvited ? (
                          <Badge variant="outline">Invited</Badge>
                        ) : !it.email ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            No email
                          </Badge>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {invitableCount} of {items.length} can be invited · {selected.size} selected
            </p>

            <div className="space-y-1.5">
              <Label>Assign role</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Everyone selected is invited with this role. You can change it per person later.
              </p>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {summary ? 'Close' : 'Cancel'}
          </Button>
          {!summary && (
            <Button onClick={doImport} disabled={submitting || selected.size === 0}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Invite {selected.size > 0 ? selected.size : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
