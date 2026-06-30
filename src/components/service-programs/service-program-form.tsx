'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ServiceProgramRow, ServiceTaskOption, ServiceTriggerRow } from './types';

const CATEGORY_OPTIONS = [
  { value: 'scheduled_maintenance', label: 'Scheduled Maintenance' },
  { value: 'unscheduled_maintenance', label: 'Unscheduled Maintenance' },
  { value: 'inspections', label: 'Inspections' },
  { value: 'custom', label: 'Custom' },
];

const TRIGGER_TYPE_OPTIONS = [
  { value: 'time', label: 'Time' },
  { value: 'distance', label: 'Distance (Miles/Km)' },
  { value: 'engine_hours', label: 'Engine Hours' },
];

const INTERVAL_TYPE_OPTIONS = [
  { value: 'repeat', label: 'Repeat' },
  { value: 'one_time', label: 'One Time' },
];

const TIME_UNIT_OPTIONS = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
];

interface ServiceProgramFormProps {
  mode: 'create' | 'edit';
  program?: ServiceProgramRow | null;
  onClose: () => void;
  onSaved: () => void;
}

interface TriggerFormState {
  triggerType: string;
  intervalType: string;
  interval: string;
  timeUnit: string;
  reminderThreshold: string;
}

const EMPTY_TRIGGER: TriggerFormState = {
  triggerType: 'time',
  intervalType: 'repeat',
  interval: '',
  timeUnit: 'months',
  reminderThreshold: '',
};

export function ServiceProgramForm({ mode, program, onClose, onSaved }: ServiceProgramFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields — Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('scheduled_maintenance');

  // Service Tasks
  const [availableTasks, setAvailableTasks] = useState<ServiceTaskOption[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [taskSearch, setTaskSearch] = useState('');

  // Triggers / Intervals
  const [triggers, setTriggers] = useState<TriggerFormState[]>([{ ...EMPTY_TRIGGER }]);

  // Fetch available service tasks
  const fetchAvailableTasks = useCallback(async () => {
    try {
      const res = await axios.get('/api/service-tasks?limit=100', { withCredentials: true });
      const items = res.data.data?.items || [];
      setAvailableTasks(items.map((t: Record<string, unknown>) => ({
        id: t.id as string,
        title: t.title as string,
      })));
    } catch {
      // Silently fail — user can still create the program
    }
  }, []);

  useEffect(() => {
    fetchAvailableTasks();
  }, [fetchAvailableTasks]);

  // Populate form with program data (edit mode)
  useEffect(() => {
    if (program && mode === 'edit') {
      setTitle(program.title || '');
      setDescription(program.description || '');
      setCategory(program.category || 'scheduled_maintenance');
      setSelectedTaskIds(program.serviceTaskIds || []);
      if (program.triggers && program.triggers.length > 0) {
        setTriggers(program.triggers.map((t: ServiceTriggerRow) => ({
          triggerType: t.triggerType || 'time',
          intervalType: t.intervalType || 'repeat',
          interval: String(t.interval || ''),
          timeUnit: t.timeUnit || 'months',
          reminderThreshold: t.reminderThreshold != null ? String(t.reminderThreshold) : '',
        })));
      }
    }
  }, [program, mode]);

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Task selection helpers
  const handleAddTask = (taskId: string) => {
    if (!selectedTaskIds.includes(taskId)) {
      setSelectedTaskIds((prev) => [...prev, taskId]);
    }
    setTaskSearch('');
  };

  const handleRemoveTask = (taskId: string) => {
    setSelectedTaskIds((prev) => prev.filter((id) => id !== taskId));
  };

  const getTaskTitle = (taskId: string): string => {
    return availableTasks.find((t) => t.id === taskId)?.title || 'Unknown Task';
  };

  // Filter available tasks
  const filteredTasks = availableTasks.filter(
    (t) =>
      !selectedTaskIds.includes(t.id) &&
      (taskSearch ? t.title.toLowerCase().includes(taskSearch.toLowerCase()) : true),
  );

  // Trigger helpers
  const handleTriggerChange = (index: number, field: keyof TriggerFormState, value: string) => {
    setTriggers((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddTrigger = () => {
    setTriggers((prev) => [...prev, { ...EMPTY_TRIGGER }]);
  };

  const handleRemoveTrigger = (index: number) => {
    setTriggers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    // Client-side validation
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = 'Title is required';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      serviceTaskIds: selectedTaskIds,
      triggers: triggers
        .filter((t) => t.interval)
        .map((t) => ({
          triggerType: t.triggerType,
          intervalType: t.intervalType,
          interval: parseFloat(t.interval),
          timeUnit: t.triggerType === 'time' ? t.timeUnit : undefined,
          reminderThreshold: t.reminderThreshold ? parseFloat(t.reminderThreshold) : undefined,
        })),
    };

    try {
      setSaving(true);
      if (mode === 'edit' && program) {
        await axios.put(`/api/service-programs/${program.id}`, payload, { withCredentials: true });
      } else {
        await axios.post('/api/service-programs', payload, { withCredentials: true });
      }
      onSaved();
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">
          {mode === 'edit' ? 'Edit Service Program' : 'Create Service Program'}
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Form body */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Details Section */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Details</h3>
            <Separator className="mb-4" />
            <div className="space-y-4">
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
              <div>
                <Label htmlFor="programDescription">Description</Label>
                <Textarea
                  id="programDescription"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the service program..."
                  rows={3}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="programCategory">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Service Tasks Section */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Service Tasks</h3>
            <Separator className="mb-4" />

            {/* Selected tasks */}
            {selectedTaskIds.length > 0 && (
              <div className="space-y-2 mb-4">
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

            {/* Add task search */}
            <div className="relative">
              <Input
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder="Search and add service tasks..."
                className="pr-8"
              />
              {taskSearch && filteredTasks.length > 0 && (
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
              {taskSearch && filteredTasks.length === 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-background shadow-md p-3">
                  <p className="text-sm text-muted-foreground">No matching service tasks found.</p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Select one or more service tasks from the library to include in this program.
            </p>
          </div>

          {/* Intervals / Triggers Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Intervals</h3>
              <Button type="button" variant="outline" size="sm" onClick={handleAddTrigger}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Trigger
              </Button>
            </div>
            <Separator className="mb-4" />

            {triggers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No triggers configured. Click &quot;Add Trigger&quot; to define when this program is due.
              </p>
            )}

            <div className="space-y-4">
              {triggers.map((trigger, idx) => (
                <div
                  key={idx}
                  className="rounded-md border border-border p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      Trigger {idx + 1}
                    </span>
                    {triggers.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveTrigger(idx)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Interval Type: Repeat / One Time */}
                  <div>
                    <Label className="text-xs">Interval Type</Label>
                    <div className="flex gap-2 mt-1.5">
                      {INTERVAL_TYPE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={cn(
                            'px-3 py-1.5 rounded-md text-sm border transition-colors',
                            trigger.intervalType === opt.value
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-border text-muted-foreground hover:bg-muted/50',
                          )}
                          onClick={() => handleTriggerChange(idx, 'intervalType', opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Trigger Type */}
                  <div>
                    <Label className="text-xs">Trigger Type</Label>
                    <Select
                      value={trigger.triggerType}
                      onValueChange={(val) => handleTriggerChange(idx, 'triggerType', val)}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRIGGER_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Interval Value + Time Unit */}
                  <div className={cn(trigger.triggerType === 'time' ? 'grid grid-cols-2 gap-3' : '')}>
                    <div>
                      <Label className="text-xs">
                        {trigger.triggerType === 'time'
                          ? 'Every'
                          : trigger.triggerType === 'distance'
                            ? 'Every (miles/km)'
                            : 'Every (hours)'}
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        value={trigger.interval}
                        onChange={(e) => handleTriggerChange(idx, 'interval', e.target.value)}
                        placeholder={trigger.triggerType === 'time' ? '3' : '5000'}
                        className="mt-1.5"
                      />
                    </div>
                    {trigger.triggerType === 'time' && (
                      <div>
                        <Label className="text-xs">Unit</Label>
                        <Select
                          value={trigger.timeUnit}
                          onValueChange={(val) => handleTriggerChange(idx, 'timeUnit', val)}
                        >
                          <SelectTrigger className="mt-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIME_UNIT_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Reminder Threshold */}
                  <div>
                    <Label className="text-xs">Reminder Threshold</Label>
                    <Input
                      type="number"
                      min="0"
                      value={trigger.reminderThreshold}
                      onChange={(e) => handleTriggerChange(idx, 'reminderThreshold', e.target.value)}
                      placeholder={
                        trigger.triggerType === 'time'
                          ? 'e.g. 7 (days before due)'
                          : trigger.triggerType === 'distance'
                            ? 'e.g. 500 (miles/km before due)'
                            : 'e.g. 50 (hours before due)'
                      }
                      className="mt-1.5"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Notify this many {trigger.triggerType === 'time' ? 'days' : trigger.triggerType === 'distance' ? 'miles/km' : 'hours'} before the service is due.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>
      </form>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : mode === 'edit' ? 'Update Program' : 'Create Program'}
        </Button>
      </div>
    </div>
  );
}
