'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import type { ServiceTaskRow } from './types';

interface ServiceTaskFormProps {
  mode: 'create' | 'edit';
  task?: ServiceTaskRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ServiceTaskForm({ mode, task, onClose, onSaved }: ServiceTaskFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields — Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Cost
  const [laborCost, setLaborCost] = useState('');
  const [partsCost, setPartsCost] = useState('');
  const [totalCost, setTotalCost] = useState('');

  // Populate form with task data (edit mode)
  useEffect(() => {
    if (task && mode === 'edit') {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setLaborCost(task.laborCost != null ? String(task.laborCost) : '');
      setPartsCost(task.partsCost != null ? String(task.partsCost) : '');
      setTotalCost(task.totalCost != null ? String(task.totalCost) : '');
    }
  }, [task, mode]);

  // Auto-calculate total when labor or parts change
  useEffect(() => {
    const labor = laborCost ? parseFloat(laborCost) : 0;
    const parts = partsCost ? parseFloat(partsCost) : 0;
    if (laborCost || partsCost) {
      setTotalCost((labor + parts).toFixed(2));
    }
  }, [laborCost, partsCost]);

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
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
      laborCost: laborCost ? parseFloat(laborCost) : undefined,
      partsCost: partsCost ? parseFloat(partsCost) : undefined,
      totalCost: totalCost ? parseFloat(totalCost) : undefined,
    };

    try {
      setSaving(true);
      if (mode === 'edit' && task) {
        await axios.put(`/api/service-tasks/${task.id}`, payload, { withCredentials: true });
      } else {
        await axios.post('/api/service-tasks', payload, { withCredentials: true });
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
        setError('Failed to save service task');
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
          {mode === 'edit' ? 'Edit Service Task' : 'Create Service Task'}
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
                <Label htmlFor="taskTitle">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="taskTitle"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); clearFieldError('title'); }}
                  placeholder="e.g. Oil Change, Tire Rotation"
                  className={`mt-1.5 ${fieldErrors.title ? 'border-destructive' : ''}`}
                />
                {fieldErrors.title && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.title}</p>
                )}
              </div>
              <div>
                <Label htmlFor="taskDescription">Description</Label>
                <Textarea
                  id="taskDescription"
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); clearFieldError('description'); }}
                  placeholder="Describe the service task..."
                  rows={3}
                  className={`mt-1.5 ${fieldErrors.description ? 'border-destructive' : ''}`}
                />
                {fieldErrors.description && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Cost Section */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Cost</h3>
            <Separator className="mb-4" />
            <div className="space-y-4">
              <div>
                <Label htmlFor="laborCost">Labor ($)</Label>
                <Input
                  id="laborCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={laborCost}
                  onChange={(e) => { setLaborCost(e.target.value); clearFieldError('laborCost'); }}
                  placeholder="0.00"
                  className={`mt-1.5 ${fieldErrors.laborCost ? 'border-destructive' : ''}`}
                />
                {fieldErrors.laborCost && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.laborCost}</p>
                )}
              </div>
              <div>
                <Label htmlFor="partsCost">Parts ($)</Label>
                <Input
                  id="partsCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={partsCost}
                  onChange={(e) => { setPartsCost(e.target.value); clearFieldError('partsCost'); }}
                  placeholder="0.00"
                  className={`mt-1.5 ${fieldErrors.partsCost ? 'border-destructive' : ''}`}
                />
                {fieldErrors.partsCost && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.partsCost}</p>
                )}
              </div>
              <div>
                <Label htmlFor="totalCost">Total ($)</Label>
                <Input
                  id="totalCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalCost}
                  onChange={(e) => { setTotalCost(e.target.value); clearFieldError('totalCost'); }}
                  placeholder="0.00"
                  className={`mt-1.5 ${fieldErrors.totalCost ? 'border-destructive' : ''}`}
                />
                {fieldErrors.totalCost && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.totalCost}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-calculated from Labor + Parts. Override if needed.
                </p>
              </div>
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
          {saving ? 'Saving...' : mode === 'edit' ? 'Update Task' : 'Create Task'}
        </Button>
      </div>
    </div>
  );
}
