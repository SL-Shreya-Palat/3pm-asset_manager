'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, X, Info, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type {
  ServiceTaskOption,
  AssetOption,
  MechanicOption,
} from './types';


interface ServiceProgramFormProps {
  mode: 'create' | 'edit';
  initialData?: Record<string, unknown> | null;
  programId?: string;
}

export function ServiceProgramForm({ mode, initialData, programId }: ServiceProgramFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ── Section 1: Details ──
  const [title, setTitle] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [availableTasks, setAvailableTasks] = useState<ServiceTaskOption[]>([]);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskDropdownOpen, setTaskDropdownOpen] = useState(false);

  // ── Section 2: Intervals ──
  const [intervalType, setIntervalType] = useState<'repeat' | 'one_time'>('repeat');
  // Repeat conditions
  const [mileageEnabled, setMileageEnabled] = useState(false);
  const [mileageEvery, setMileageEvery] = useState('');
  const [engineHoursEnabled, setEngineHoursEnabled] = useState(false);
  const [engineHoursEvery, setEngineHoursEvery] = useState('');
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [calendarEvery, setCalendarEvery] = useState('');
  const [calendarUnit, setCalendarUnit] = useState<string>('day');
  // Ends
  const [endsType, setEndsType] = useState<'never' | 'on' | 'after'>('never');
  const [endsDate, setEndsDate] = useState('');
  const [endsOccurrences, setEndsOccurrences] = useState('');
  // One-time conditions
  const [dueMileageEnabled, setDueMileageEnabled] = useState(false);
  const [dueMileageMode, setDueMileageMode] = useState<'at' | 'in'>('at');
  const [dueMileageValue, setDueMileageValue] = useState('');
  const [dueEngineHoursEnabled, setDueEngineHoursEnabled] = useState(false);
  const [dueEngineHoursMode, setDueEngineHoursMode] = useState<'at' | 'in'>('at');
  const [dueEngineHoursValue, setDueEngineHoursValue] = useState('');
  const [dueOnDateEnabled, setDueOnDateEnabled] = useState(false);
  const [dueOnDate, setDueOnDate] = useState('');

  // ── Section 3: Assets ──
  const [availableAssets, setAvailableAssets] = useState<AssetOption[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  // ── Section 4: Reminders ──
  // Threshold rows
  const [thresholdMileageEnabled, setThresholdMileageEnabled] = useState(false);
  const [thresholdMileageValue, setThresholdMileageValue] = useState('');
  const [thresholdEngineHoursEnabled, setThresholdEngineHoursEnabled] = useState(false);
  const [thresholdEngineHoursValue, setThresholdEngineHoursValue] = useState('');
  const [thresholdCalendarEnabled, setThresholdCalendarEnabled] = useState(false);
  const [thresholdCalendarValue, setThresholdCalendarValue] = useState('');
  const [thresholdCalendarUnit, setThresholdCalendarUnit] = useState<string>('day');
  // Other reminders
  const [autoCreateWorkOrder, setAutoCreateWorkOrder] = useState(false);
  const [mechanicId, setMechanicId] = useState('');
  const [availableMechanics, setAvailableMechanics] = useState<MechanicOption[]>([]);

  // ── Fetch available service tasks ──
  const fetchAvailableTasks = useCallback(async () => {
    try {
      const res = await axios.get('/api/service-tasks?limit=100', { withCredentials: true });
      const items = res.data.data?.items || [];
      setAvailableTasks(items.map((t: Record<string, unknown>) => ({
        id: t.id as string,
        title: t.title as string,
      })));
    } catch {
      // Silent fail
    }
  }, []);

  // ── Fetch available assets ──
  const fetchAvailableAssets = useCallback(async () => {
    try {
      const res = await axios.get('/api/assets?limit=100', { withCredentials: true });
      const items = res.data.data?.items || [];
      setAvailableAssets(items.map((a: Record<string, unknown>) => ({
        id: a.id as string,
        name: a.name as string,
        assetNumber: a.assetNumber as string | undefined,
        make: a.make as string | undefined,
        model: a.model as string | undefined,
        status: a.status as string | undefined,
      })));
    } catch {
      // Silent fail
    }
  }, []);

  // ── Fetch available mechanics (users) ──
  const fetchAvailableMechanics = useCallback(async () => {
    try {
      const res = await axios.get('/api/users?limit=100', { withCredentials: true });
      const items = res.data.data?.items || res.data.data || [];
      setAvailableMechanics(items.map((u: Record<string, unknown>) => ({
        id: u.id as string,
        name: ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || (u.email as string) || 'Unknown',
        email: u.email as string | undefined,
      })));
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    fetchAvailableTasks();
    fetchAvailableAssets();
    fetchAvailableMechanics();
  }, [fetchAvailableTasks, fetchAvailableAssets, fetchAvailableMechanics]);

  // ── Populate form in edit mode ──
  useEffect(() => {
    if (initialData && mode === 'edit') {
      setTitle((initialData.title as string) || '');
      setSelectedTaskIds((initialData.serviceTaskIds as string[]) || []);

      const iv = initialData.interval as Record<string, unknown> | undefined;
      if (iv) {
        setIntervalType(iv.type === 'one_time' ? 'one_time' : 'repeat');
        if (iv.type === 'repeat') {
          const mil = iv.mileage as { enabled: boolean; every: number } | undefined;
          if (mil) { setMileageEnabled(mil.enabled); setMileageEvery(mil.every ? String(mil.every) : ''); }
          const eng = iv.engineHours as { enabled: boolean; every: number } | undefined;
          if (eng) { setEngineHoursEnabled(eng.enabled); setEngineHoursEvery(eng.every ? String(eng.every) : ''); }
          const cal = iv.calendar as { enabled: boolean; every: number; unit: string } | undefined;
          if (cal) { setCalendarEnabled(cal.enabled); setCalendarEvery(cal.every ? String(cal.every) : ''); setCalendarUnit(cal.unit || 'day'); }
          const ends = iv.ends as { type: string; date?: string; occurrences?: number } | undefined;
          if (ends) {
            setEndsType((ends.type as 'never' | 'on' | 'after') || 'never');
            if (ends.date) setEndsDate(ends.date.split('T')[0]);
            if (ends.occurrences) setEndsOccurrences(String(ends.occurrences));
          }
        } else {
          const dm = iv.dueMileage as { enabled: boolean; mode: string; value: number } | undefined;
          if (dm) { setDueMileageEnabled(dm.enabled); setDueMileageMode((dm.mode as 'at' | 'in') || 'at'); setDueMileageValue(dm.value ? String(dm.value) : ''); }
          const de = iv.dueEngineHours as { enabled: boolean; mode: string; value: number } | undefined;
          if (de) { setDueEngineHoursEnabled(de.enabled); setDueEngineHoursMode((de.mode as 'at' | 'in') || 'at'); setDueEngineHoursValue(de.value ? String(de.value) : ''); }
          const dd = iv.dueOnDate as { enabled: boolean; date?: string } | undefined;
          if (dd) { setDueOnDateEnabled(dd.enabled); if (dd.date) setDueOnDate(dd.date.split('T')[0]); }
        }
      }

      setSelectedAssetIds(new Set((initialData.assetIds as string[]) || []));

      const rm = initialData.reminders as Record<string, unknown> | undefined;
      if (rm) {
        const tm = rm.thresholdMileage as { enabled: boolean; value: number } | undefined;
        if (tm) { setThresholdMileageEnabled(tm.enabled); setThresholdMileageValue(tm.value ? String(tm.value) : ''); }
        const te = rm.thresholdEngineHours as { enabled: boolean; value: number } | undefined;
        if (te) { setThresholdEngineHoursEnabled(te.enabled); setThresholdEngineHoursValue(te.value ? String(te.value) : ''); }
        const tc = rm.thresholdCalendar as { enabled: boolean; value: number; unit: string } | undefined;
        if (tc) { setThresholdCalendarEnabled(tc.enabled); setThresholdCalendarValue(tc.value ? String(tc.value) : ''); setThresholdCalendarUnit(tc.unit || 'day'); }
        setAutoCreateWorkOrder((rm.autoCreateWorkOrder as boolean) ?? false);
        setMechanicId((rm.mechanicId as string) || '');
      }
    }
  }, [initialData, mode]);

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // ── Task helpers ──
  const handleAddTask = (taskId: string) => {
    if (!selectedTaskIds.includes(taskId)) {
      setSelectedTaskIds((prev) => [...prev, taskId]);
    }
    setTaskSearch('');
    setTaskDropdownOpen(false);
  };

  const handleRemoveTask = (taskId: string) => {
    setSelectedTaskIds((prev) => prev.filter((id) => id !== taskId));
  };

  const getTaskTitle = (taskId: string): string => {
    return availableTasks.find((t) => t.id === taskId)?.title || 'Unknown Task';
  };

  const filteredTasks = availableTasks.filter(
    (t) =>
      !selectedTaskIds.includes(t.id) &&
      (taskSearch ? t.title.toLowerCase().includes(taskSearch.toLowerCase()) : true),
  );

  const navigateBack = () => router.push('/maintenance/service-programs');

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = 'Title is required';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const intervalPayload: Record<string, unknown> = { type: intervalType };
    if (intervalType === 'repeat') {
      intervalPayload.mileage = { enabled: mileageEnabled, every: mileageEvery ? parseFloat(mileageEvery) : 0 };
      intervalPayload.engineHours = { enabled: engineHoursEnabled, every: engineHoursEvery ? parseFloat(engineHoursEvery) : 0 };
      intervalPayload.calendar = { enabled: calendarEnabled, every: calendarEvery ? parseFloat(calendarEvery) : 0, unit: calendarUnit };
      intervalPayload.ends = {
        type: endsType,
        ...(endsType === 'on' ? { date: endsDate || undefined } : {}),
        ...(endsType === 'after' ? { occurrences: endsOccurrences ? parseInt(endsOccurrences, 10) : undefined } : {}),
      };
    } else {
      intervalPayload.dueMileage = { enabled: dueMileageEnabled, mode: dueMileageMode, value: dueMileageValue ? parseFloat(dueMileageValue) : 0 };
      intervalPayload.dueEngineHours = { enabled: dueEngineHoursEnabled, mode: dueEngineHoursMode, value: dueEngineHoursValue ? parseFloat(dueEngineHoursValue) : 0 };
      intervalPayload.dueOnDate = { enabled: dueOnDateEnabled, date: dueOnDate || undefined };
    }

    const payload = {
      title: title.trim(),
      serviceTaskIds: selectedTaskIds,
      interval: intervalPayload,
      assetIds: Array.from(selectedAssetIds),
      reminders: {
        thresholdMileage: { enabled: thresholdMileageEnabled, value: thresholdMileageValue ? parseFloat(thresholdMileageValue) : 0 },
        thresholdEngineHours: { enabled: thresholdEngineHoursEnabled, value: thresholdEngineHoursValue ? parseFloat(thresholdEngineHoursValue) : 0 },
        thresholdCalendar: { enabled: thresholdCalendarEnabled, value: thresholdCalendarValue ? parseFloat(thresholdCalendarValue) : 0, unit: thresholdCalendarUnit },
        autoCreateWorkOrder,
        mechanicId: autoCreateWorkOrder && mechanicId ? mechanicId : undefined,
      },
    };

    try {
      setSaving(true);
      if (mode === 'edit' && programId) {
        await axios.put(`/api/service-programs/${programId}`, payload, { withCredentials: true });
      } else {
        await axios.post('/api/service-programs', payload, { withCredentials: true });
      }
      navigateBack();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const errData = err.response.data.error;
        if (typeof errData === 'object') {
          setFieldErrors(errData as Record<string, string>);
        } else {
          setError(String(errData));
        }
      } else {
        setError('Failed to save service program');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="p-6 w-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={navigateBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {mode === 'edit' ? 'Edit Service Program' : 'Add Service Program'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {mode === 'edit' ? 'Update this service program' : 'Create a new service program'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Two-column section grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

            {/* ── Section 1: Details ── */}
            <div className="rounded-lg border bg-card p-5 shadow-sm">
              <h2 className="text-base font-semibold text-foreground mb-4">Details</h2>
              <Separator className="mb-4" />
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <Label htmlFor="programTitle">
                    Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="programTitle"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); clearFieldError('title'); }}
                    placeholder="e.g. Monthly Oil Change Program"
                    className={`mt-1.5 ${fieldErrors.title ? 'border-destructive' : ''}`}
                  />
                  {fieldErrors.title && (
                    <p className="text-sm text-destructive mt-1">{fieldErrors.title}</p>
                  )}
                </div>

                {/* Service Task */}
                <div>
                  <Label>Service Task</Label>
                  {selectedTaskIds.length > 0 && (
                    <div className="space-y-2 mt-1.5 mb-2">
                      {selectedTaskIds.map((taskId) => (
                        <div
                          key={taskId}
                          className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                        >
                          <span className="text-sm text-foreground">{getTaskTitle(taskId)}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleRemoveTask(taskId)}
                            className="text-destructive hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <Input
                      value={taskSearch}
                      onChange={(e) => { setTaskSearch(e.target.value); setTaskDropdownOpen(true); }}
                      onFocus={() => setTaskDropdownOpen(true)}
                      placeholder="Click to select a service task..."
                      className="mt-1.5"
                    />
                    {taskDropdownOpen && filteredTasks.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-background shadow-md max-h-[200px] overflow-y-auto">
                        {filteredTasks.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                            onClick={() => handleAddTask(task.id)}
                          >
                            {task.title}
                          </button>
                        ))}
                      </div>
                    )}
                    {taskDropdownOpen && taskSearch && filteredTasks.length === 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-background shadow-md p-3">
                        <p className="text-sm text-muted-foreground">No matching service tasks found.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section 2: Intervals ── */}
            <div className="rounded-lg border bg-card p-5 shadow-sm">
              <h2 className="text-base font-semibold text-foreground mb-4">Intervals</h2>
              <Separator className="mb-4" />
              <div className="space-y-5">
                {/* Repeat / One Time toggle */}
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="intervalType"
                      checked={intervalType === 'repeat'}
                      onChange={() => setIntervalType('repeat')}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm text-foreground">Repeat</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="intervalType"
                      checked={intervalType === 'one_time'}
                      onChange={() => setIntervalType('one_time')}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm text-foreground">One Time</span>
                  </label>
                </div>

                {intervalType === 'repeat' && (
                  <div className="space-y-5">
                    <p className="text-xs text-muted-foreground">Repeat (whichever occurs first)</p>

                    {/* Row 1: Mileage */}
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="mileageEnabled"
                        checked={mileageEnabled}
                        onCheckedChange={(checked) => setMileageEnabled(checked === true)}
                      />
                      <span className="text-sm text-foreground w-10 shrink-0">Every</span>
                      <Input
                        type="number"
                        min="0"
                        value={mileageEvery}
                        onChange={(e) => setMileageEvery(e.target.value)}
                        placeholder="0"
                        className="w-20"
                        disabled={!mileageEnabled}
                      />
                      <div className="inline-flex rounded-md border border-border overflow-hidden">
                        <span className={cn(
                          'px-3 py-1.5 text-xs font-medium',
                          'bg-primary text-primary-foreground',
                        )}>
                          mi
                        </span>
                      </div>
                    </div>

                    {/* Row 2: Engine Hours */}
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="engineHoursEnabled"
                        checked={engineHoursEnabled}
                        onCheckedChange={(checked) => setEngineHoursEnabled(checked === true)}
                      />
                      <span className="text-sm text-foreground w-10 shrink-0">Every</span>
                      <Input
                        type="number"
                        min="0"
                        value={engineHoursEvery}
                        onChange={(e) => setEngineHoursEvery(e.target.value)}
                        placeholder="0"
                        className="w-20"
                        disabled={!engineHoursEnabled}
                      />
                      <div className="inline-flex rounded-md border border-border overflow-hidden">
                        <span className={cn(
                          'px-3 py-1.5 text-xs font-medium',
                          'bg-primary text-primary-foreground',
                        )}>
                          hrs
                        </span>
                      </div>
                    </div>

                    {/* Row 3: Calendar */}
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="calendarEnabled"
                        checked={calendarEnabled}
                        onCheckedChange={(checked) => setCalendarEnabled(checked === true)}
                      />
                      <span className="text-sm text-foreground w-10 shrink-0">Every</span>
                      <Input
                        type="number"
                        min="0"
                        value={calendarEvery}
                        onChange={(e) => setCalendarEvery(e.target.value)}
                        placeholder="0"
                        className="w-20"
                        disabled={!calendarEnabled}
                      />
                      <div className="inline-flex rounded-md border border-border overflow-hidden">
                        {(['day', 'week', 'month', 'year'] as const).map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            disabled={!calendarEnabled}
                            onClick={() => setCalendarUnit(unit)}
                            className={cn(
                              'px-3 py-1.5 text-xs font-medium transition-colors border-r border-border last:border-r-0',
                              calendarUnit === unit
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-background text-foreground hover:bg-muted',
                              !calendarEnabled && 'opacity-50 cursor-not-allowed',
                            )}
                          >
                            {unit}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Ends */}
                    <div className="pt-2">
                      <Label className="text-xs mb-2 block">Ends</Label>
                      <div className="space-y-3">
                        {/* Never */}
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="endsType"
                            checked={endsType === 'never'}
                            onChange={() => setEndsType('never')}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-sm text-foreground">Never</span>
                        </label>
                        {/* On */}
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="endsType"
                            checked={endsType === 'on'}
                            onChange={() => setEndsType('on')}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-sm text-foreground w-10 shrink-0">On</span>
                          <Input
                            type="date"
                            value={endsDate}
                            onChange={(e) => setEndsDate(e.target.value)}
                            disabled={endsType !== 'on'}
                            className="w-44"
                          />
                        </div>
                        {/* After */}
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="endsType"
                            checked={endsType === 'after'}
                            onChange={() => setEndsType('after')}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-sm text-foreground w-10 shrink-0">After</span>
                          <Input
                            type="number"
                            min="1"
                            value={endsOccurrences}
                            onChange={(e) => setEndsOccurrences(e.target.value)}
                            disabled={endsType !== 'after'}
                            placeholder="0"
                            className="w-20"
                          />
                          <span className="text-sm text-muted-foreground">Occurrences</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {intervalType === 'one_time' && (
                  <div className="space-y-5">
                    <p className="text-xs text-muted-foreground">Due</p>

                    {/* Row 1: Mileage */}
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="dueMileageEnabled"
                        checked={dueMileageEnabled}
                        onCheckedChange={(checked) => setDueMileageEnabled(checked === true)}
                      />
                      <div className="inline-flex rounded-md border border-border overflow-hidden">
                        {(['at', 'in'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            disabled={!dueMileageEnabled}
                            onClick={() => setDueMileageMode(m)}
                            className={cn(
                              'px-3 py-1.5 text-xs font-medium transition-colors border-r border-border last:border-r-0 capitalize',
                              dueMileageMode === m
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-background text-foreground hover:bg-muted',
                              !dueMileageEnabled && 'opacity-50 cursor-not-allowed',
                            )}
                          >
                            {m === 'at' ? 'At' : 'In'}
                          </button>
                        ))}
                      </div>
                      <Input
                        type="number"
                        min="0"
                        value={dueMileageValue}
                        onChange={(e) => setDueMileageValue(e.target.value)}
                        placeholder="0"
                        className="w-20"
                        disabled={!dueMileageEnabled}
                      />
                      <div className="inline-flex rounded-md border border-border overflow-hidden">
                        <span className={cn(
                          'px-3 py-1.5 text-xs font-medium',
                          'bg-primary text-primary-foreground',
                        )}>
                          mi
                        </span>
                      </div>
                    </div>

                    {/* Row 2: Engine Hours */}
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="dueEngineHoursEnabled"
                        checked={dueEngineHoursEnabled}
                        onCheckedChange={(checked) => setDueEngineHoursEnabled(checked === true)}
                      />
                      <div className="inline-flex rounded-md border border-border overflow-hidden">
                        {(['at', 'in'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            disabled={!dueEngineHoursEnabled}
                            onClick={() => setDueEngineHoursMode(m)}
                            className={cn(
                              'px-3 py-1.5 text-xs font-medium transition-colors border-r border-border last:border-r-0 capitalize',
                              dueEngineHoursMode === m
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-background text-foreground hover:bg-muted',
                              !dueEngineHoursEnabled && 'opacity-50 cursor-not-allowed',
                            )}
                          >
                            {m === 'at' ? 'At' : 'In'}
                          </button>
                        ))}
                      </div>
                      <Input
                        type="number"
                        min="0"
                        value={dueEngineHoursValue}
                        onChange={(e) => setDueEngineHoursValue(e.target.value)}
                        placeholder="0"
                        className="w-20"
                        disabled={!dueEngineHoursEnabled}
                      />
                      <div className="inline-flex rounded-md border border-border overflow-hidden">
                        <span className={cn(
                          'px-3 py-1.5 text-xs font-medium',
                          'bg-primary text-primary-foreground',
                        )}>
                          hrs
                        </span>
                      </div>
                    </div>

                    {/* Row 3: On Date */}
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="dueOnDateEnabled"
                        checked={dueOnDateEnabled}
                        onCheckedChange={(checked) => setDueOnDateEnabled(checked === true)}
                      />
                      <span className="text-sm text-foreground w-6 shrink-0">On</span>
                      <Input
                        type="date"
                        value={dueOnDate}
                        onChange={(e) => setDueOnDate(e.target.value)}
                        disabled={!dueOnDateEnabled}
                        className="w-44"
                        placeholder="Select date"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Section 3: Assets ── */}
            <div className="rounded-lg border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground">Assets</h2>
                {availableAssets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected = availableAssets.every((a) => selectedAssetIds.has(a.id));
                      setSelectedAssetIds(allSelected ? new Set() : new Set(availableAssets.map((a) => a.id)));
                    }}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    {availableAssets.every((a) => selectedAssetIds.has(a.id)) ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>
              <Separator className="mb-4" />
              <div className="rounded-md border border-border overflow-hidden">
                <div className="max-h-[300px] overflow-y-auto divide-y divide-border">
                  {availableAssets.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No assets available
                    </p>
                  ) : (
                    availableAssets.map((asset) => (
                      <label
                        key={asset.id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selectedAssetIds.has(asset.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedAssetIds);
                            if (checked) next.add(asset.id);
                            else next.delete(asset.id);
                            setSelectedAssetIds(next);
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-foreground">{asset.name}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            {asset.assetNumber && (
                              <span className="text-xs text-muted-foreground">#{asset.assetNumber}</span>
                            )}
                            {asset.make && (
                              <span className="text-xs text-muted-foreground">{asset.make}</span>
                            )}
                            {asset.model && (
                              <span className="text-xs text-muted-foreground">{asset.model}</span>
                            )}
                          </div>
                        </div>
                        {asset.status && (
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded-full capitalize',
                            asset.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600',
                          )}>
                            {asset.status}
                          </span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </div>
              {selectedAssetIds.size > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {selectedAssetIds.size} asset{selectedAssetIds.size !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>

            {/* ── Section 4: Reminders ── */}
            <div className="rounded-lg border bg-card p-5 shadow-sm">
              <h2 className="text-base font-semibold text-foreground mb-4">Reminders</h2>
              <Separator className="mb-4" />
              <div className="space-y-5">
                {/* Threshold */}
                <div className="space-y-4">
                  <Label className="text-xs">Threshold (Period prior to event)</Label>

                  {/* Row 1: Mileage */}
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="thresholdMileageEnabled"
                      checked={thresholdMileageEnabled}
                      onCheckedChange={(checked) => setThresholdMileageEnabled(checked === true)}
                    />
                    <Input
                      type="number"
                      min="0"
                      value={thresholdMileageValue}
                      onChange={(e) => setThresholdMileageValue(e.target.value)}
                      placeholder="0"
                      className="w-20"
                      disabled={!thresholdMileageEnabled}
                    />
                    <div className="inline-flex rounded-md border border-border overflow-hidden">
                      <span className={cn(
                        'px-3 py-1.5 text-xs font-medium',
                        'bg-primary text-primary-foreground',
                      )}>
                        mi
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Engine Hours */}
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="thresholdEngineHoursEnabled"
                      checked={thresholdEngineHoursEnabled}
                      onCheckedChange={(checked) => setThresholdEngineHoursEnabled(checked === true)}
                    />
                    <Input
                      type="number"
                      min="0"
                      value={thresholdEngineHoursValue}
                      onChange={(e) => setThresholdEngineHoursValue(e.target.value)}
                      placeholder="0"
                      className="w-20"
                      disabled={!thresholdEngineHoursEnabled}
                    />
                    <div className="inline-flex rounded-md border border-border overflow-hidden">
                      <span className={cn(
                        'px-3 py-1.5 text-xs font-medium',
                        'bg-primary text-primary-foreground',
                      )}>
                        hrs
                      </span>
                    </div>
                  </div>

                  {/* Row 3: Calendar */}
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="thresholdCalendarEnabled"
                      checked={thresholdCalendarEnabled}
                      onCheckedChange={(checked) => setThresholdCalendarEnabled(checked === true)}
                    />
                    <Input
                      type="number"
                      min="0"
                      value={thresholdCalendarValue}
                      onChange={(e) => setThresholdCalendarValue(e.target.value)}
                      placeholder="0"
                      className="w-20"
                      disabled={!thresholdCalendarEnabled}
                    />
                    <div className="inline-flex rounded-md border border-border overflow-hidden">
                      {(['day', 'week', 'month', 'year'] as const).map((unit) => (
                        <button
                          key={unit}
                          type="button"
                          disabled={!thresholdCalendarEnabled}
                          onClick={() => setThresholdCalendarUnit(unit)}
                          className={cn(
                            'px-3 py-1.5 text-xs font-medium transition-colors border-r border-border last:border-r-0',
                            thresholdCalendarUnit === unit
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background text-foreground hover:bg-muted',
                            !thresholdCalendarEnabled && 'opacity-50 cursor-not-allowed',
                          )}
                        >
                          {unit}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Auto create work order */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="autoCreateWO"
                      checked={autoCreateWorkOrder}
                      onCheckedChange={(checked) => setAutoCreateWorkOrder(checked === true)}
                    />
                    <Label htmlFor="autoCreateWO" className="text-sm cursor-pointer">
                      Auto create work order
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[280px]">
                        <p>
                          Work Orders will be auto-created based on the range of thresholds set.
                          Also the Service will be marked as &apos;Due soon&apos; once any of the above threshold is crossed.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {autoCreateWorkOrder && (
                    <div>
                      <Label className="text-xs">Choose Mechanic</Label>
                      <Select value={mechanicId} onValueChange={setMechanicId}>
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="Select mechanic..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableMechanics.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Link
                        href="/people/users"
                        target="_blank"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1.5"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Add new mechanic
                      </Link>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 mb-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={navigateBack} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : mode === 'edit' ? 'Update Program' : 'Create Program'}
            </Button>
          </div>
        </form>
      </div>
    </TooltipProvider>
  );
}
