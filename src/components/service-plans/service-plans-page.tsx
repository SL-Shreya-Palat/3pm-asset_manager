'use client';

/**
 * Service Plans — the hierarchical servicing manager (mirrors Command).
 *
 * A plan groups schedules; schedules sharing a Group number are linked by Order
 * so servicing a higher-order schedule (Service C) resets the lower ones (A, B).
 * List + an inline editor with a schedules grid (Name / Unit / Interval /
 * Recurring / Group / Order). AM-owned: works the same standalone or connected.
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Trash2, Pencil, Archive, ArchiveRestore, Loader2, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { ShowArchivedToggle } from '@/components/ui/show-archived-toggle';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { checkRecordOwnership } from '@/lib/rbac';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Permissions } from '@/consts/permissions';

const UNITS = ['Kilometers', 'Hours', 'Days', 'Months'] as const;

interface ScheduleRow {
  id?: string;
  name: string;
  unitOfMeasurement: string;
  serviceInterval: number | null;
  recurring: boolean;
  archived: boolean;
  sortOrder: number;
  serviceGroup: number | null;
}

interface PlanRow {
  id: string;
  name: string;
  schedules: ScheduleRow[];
  source: string;
  assignedAssets?: number;
  isArchived?: boolean;
  createdBy: string | null;
}

const emptySchedule = (order: number): ScheduleRow => ({
  name: '',
  unitOfMeasurement: 'Kilometers',
  serviceInterval: null,
  recurring: true,
  archived: false,
  sortOrder: order,
  serviceGroup: 1,
});

const SERVICE_PLAN_FORM_ID = 'maintenance.servicePlans.servicePlan';

export function ServicePlansPage() {
  const { user } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();
  const editLevel = hasFullAccess ? 'ALL' : permissionIndex.getEditLevel(SERVICE_PLAN_FORM_ID);
  const archiveLevel = hasFullAccess ? 'ALL' : permissionIndex.getArchiveLevel(SERVICE_PLAN_FORM_ID);


  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [name, setName] = useState('');
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingPlan, setArchivingPlan] = useState<PlanRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Service task options for schedule name field
  const [serviceTaskOptions, setServiceTaskOptions] = useState<SearchableSelectOption[]>([]);
  const [serviceTasksLoading, setServiceTasksLoading] = useState(false);

  const fetchServiceTasks = useCallback(async () => {
    setServiceTasksLoading(true);
    try {
      const res = await axios.get('/api/service-tasks', { params: { limit: 100 } });
      const items = res.data?.data?.items ?? [];
      setServiceTaskOptions(
        items.map((t: { id: string; title: string; description?: string }) => ({
          label: t.title,
          value: t.title,
          meta: t.description || undefined,
        })),
      );
    } catch {
      setServiceTaskOptions([]);
    } finally {
      setServiceTasksLoading(false);
    }
  }, []);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/service-plans', { params: { limit: 100, showArchived } });
      setPlans(res.data?.data?.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing({ id: '', name: '', schedules: [], source: 'local', createdBy: null });
    setName('');
    setSchedules([emptySchedule(1)]);
    fetchServiceTasks();
  };
  const openEdit = (p: PlanRow) => {
    setEditing(p);
    setName(p.name);
    setSchedules(p.schedules.length ? p.schedules.map((s) => ({ ...s })) : [emptySchedule(1)]);
    fetchServiceTasks();
  };
  const close = () => setEditing(null);

  const updateSchedule = (i: number, patch: Partial<ScheduleRow>) =>
    setSchedules((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addSchedule = () => setSchedules((rows) => [...rows, emptySchedule(rows.length + 1)]);
  const removeSchedule = (i: number) => setSchedules((rows) => rows.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        schedules: schedules
          .filter((s) => s.name.trim())
          .map((s) => ({
            id: s.id,
            name: s.name.trim(),
            unitOfMeasurement: s.unitOfMeasurement,
            serviceInterval: s.serviceInterval,
            recurring: s.recurring,
            archived: s.archived,
            sortOrder: s.sortOrder,
            serviceGroup: s.serviceGroup,
          })),
      };
      if (editing?.id) await axios.patch(`/api/service-plans/${editing.id}`, payload);
      else await axios.post('/api/service-plans', payload);
      close();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!archivingPlan) return;
    setArchiving(true);
    try {
      await axios.patch(`/api/service-plans/${archivingPlan.id}/archive`, {
        archived: !archivingPlan.isArchived,
      });
      setArchiveDialogOpen(false);
      setArchivingPlan(null);
      await load();
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Service Plans"
        description="Define grouped service schedules for your fleet."
        count={plans.length}
      >
        <ShowArchivedToggle checked={showArchived} onCheckedChange={setShowArchived} />
        <PermissionGuard permission={Permissions.maintenance.servicePlans.form.create}>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> New Plan
          </Button>
        </PermissionGuard>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No service plans yet. Create one to define grouped service schedules.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-160 text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-3 py-2.5" />
                  <th className="px-3 py-2.5">Plan</th>
                  <th className="px-3 py-2.5">Schedules</th>
                  <th className="px-3 py-2.5">Assigned Vehicles</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => {
                  const rows = [...p.schedules]
                    .filter((s) => !s.archived)
                    .sort(
                      (a, b) =>
                        (a.serviceGroup ?? 0) - (b.serviceGroup ?? 0) || a.sortOrder - b.sortOrder,
                    );
                  const isOpen = expanded.has(p.id);
                  return (
                    <Fragment key={p.id}>
                      <tr className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleExpand(p.id)}
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={isOpen ? 'Collapse' : 'Expand'}
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleExpand(p.id)}
                            className="flex items-center gap-2 text-left"
                          >
                            <span className="font-medium text-foreground">{p.name}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {rows.length} schedule{rows.length !== 1 ? 's' : ''}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {p.assignedAssets ?? 0}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1">
                            {!p.isArchived && checkRecordOwnership(editLevel, p.createdBy, user?.id) && (
                              <PermissionGuard permission={Permissions.maintenance.servicePlans.form.edit}>
                                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(p)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </PermissionGuard>
                            )}
                            {checkRecordOwnership(archiveLevel, p.createdBy, user?.id) && (
                              <PermissionGuard permission={Permissions.maintenance.servicePlans.form.archive}>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => {
                                    setArchivingPlan(p);
                                    setArchiveDialogOpen(true);
                                  }}
                                >
                                  {p.isArchived ? (
                                    <ArchiveRestore className="h-4 w-4" />
                                  ) : (
                                    <Archive className="h-4 w-4" />
                                  )}
                                </Button>
                              </PermissionGuard>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-muted/20">
                          <td colSpan={5} className="px-3 pb-3 pt-1">
                            {rows.length === 0 ? (
                              <p className="py-2 pl-10 text-xs text-muted-foreground">No schedules.</p>
                            ) : (
                              <div className="ml-10 space-y-3">
                                {(() => {
                                  // Group schedules by serviceGroup (same as construction portal).
                                  const groups = new Map<number, ScheduleRow[]>();
                                  for (const s of rows) {
                                    const g = s.serviceGroup ?? 0;
                                    if (!groups.has(g)) groups.set(g, []);
                                    groups.get(g)!.push(s);
                                  }
                                  return [...groups.entries()]
                                    .sort((a, b) => a[0] - b[0])
                                    .map(([groupNo, groupRows]) => (
                                      <div
                                        key={groupNo}
                                        className="overflow-hidden rounded-md border border-border bg-card"
                                      >
                                        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
                                          <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                                            {groupNo > 0 ? `Schedule Group ${groupNo}` : 'Ungrouped'}
                                          </span>
                                          {groupRows.length > 1 && (
                                            <span className="text-[11px] text-muted-foreground">
                                              · linked — completing a higher schedule resets the lower ones
                                            </span>
                                          )}
                                        </div>
                                        <div className="overflow-x-auto">
                                          <table className="w-full min-w-120 text-left text-sm">
                                            <thead>
                                              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                <th className="px-3 py-2">Schedule</th>
                                                <th className="px-3 py-2">Unit</th>
                                                <th className="px-3 py-2">Interval</th>
                                                <th className="px-3 py-2">Recurring</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {groupRows.map((s, i) => (
                                                <tr
                                                  key={s.id ?? i}
                                                  className="border-b border-border/60 last:border-0"
                                                >
                                                  <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                                                  <td className="px-3 py-2 text-muted-foreground">{s.unitOfMeasurement}</td>
                                                  <td className="px-3 py-2 text-foreground">
                                                    {s.serviceInterval != null ? s.serviceInterval.toLocaleString() : '—'}
                                                  </td>
                                                  <td className="px-3 py-2">
                                                    {s.recurring ? (
                                                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                                        Yes
                                                      </span>
                                                    ) : (
                                                      <span className="text-xs text-muted-foreground">No</span>
                                                    )}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    ));
                                })()}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Archive Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={archivingPlan?.name || 'Service Plan'}
        action={archivingPlan?.isArchived ? 'unarchive' : 'archive'}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Editor */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-background p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">
              {editing.id ? 'Edit service plan' : 'New service plan'}
            </h2>

            <label className="mt-4 block text-sm font-medium text-foreground">Plan name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Heavy Vehicle Servicing"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />

            <div className="mt-5 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Schedules</h3>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" /> Same Group + higher Order = resets the lower ones
              </span>
            </div>

            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-2">Name</th>
                    <th className="px-2">Unit</th>
                    <th className="px-2">Interval</th>
                    <th className="px-2">Recurring</th>
                    <th className="px-2">Group</th>
                    <th className="px-2">Order</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="py-1.5 pr-2">
                        <SearchableSelect
                          options={serviceTaskOptions}
                          value={s.name || null}
                          onValueChange={(val) => updateSchedule(i, { name: val ?? '' })}
                          placeholder="Select service task"
                          searchPlaceholder="Search service tasks..."
                          emptyMessage="No service tasks found"
                          loading={serviceTasksLoading}
                          isClearable
                        />
                      </td>
                      <td className="px-2">
                        <select
                          value={s.unitOfMeasurement}
                          onChange={(e) => updateSchedule(i, { unitOfMeasurement: e.target.value })}
                          className="rounded border border-border bg-background px-2 py-1"
                        >
                          {UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2">
                        <input
                          type="number"
                          value={s.serviceInterval ?? ''}
                          onChange={(e) =>
                            updateSchedule(i, {
                              serviceInterval: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          className="w-20 rounded border border-border bg-background px-2 py-1"
                        />
                      </td>
                      <td className="px-2 text-center">
                        <input
                          type="checkbox"
                          checked={s.recurring}
                          onChange={(e) => updateSchedule(i, { recurring: e.target.checked })}
                        />
                      </td>
                      <td className="px-2">
                        <input
                          type="number"
                          value={s.serviceGroup ?? ''}
                          onChange={(e) =>
                            updateSchedule(i, {
                              serviceGroup: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          className="w-16 rounded border border-border bg-background px-2 py-1"
                        />
                      </td>
                      <td className="px-2">
                        <input
                          type="number"
                          value={s.sortOrder}
                          onChange={(e) => updateSchedule(i, { sortOrder: Number(e.target.value) })}
                          className="w-16 rounded border border-border bg-background px-2 py-1"
                        />
                      </td>
                      <td className="px-2">
                        <Button variant="ghost" size="icon-sm" onClick={() => removeSchedule(i)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={addSchedule}
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add schedule
            </button>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={close} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || !name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save plan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
