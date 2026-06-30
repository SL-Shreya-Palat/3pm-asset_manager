'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import type { AssetTypeItem } from './types';

interface AssetTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTypeCreated?: () => void;
}

export function AssetTypeDialog({ open, onOpenChange, onTypeCreated }: AssetTypeDialogProps) {
  const [assetTypes, setAssetTypes] = useState<AssetTypeItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state for add/edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const fetchTypes = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/asset-types', { withCredentials: true });
      setAssetTypes(res.data.data || []);
    } catch {
      console.error('Failed to fetch asset types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchTypes();
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setEditingId(null);
    setFormName('');
    setError('');
    setShowForm(false);
  };

  const handleEdit = (type: AssetTypeItem) => {
    setEditingId(type.id);
    setFormName(type.name);
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setError('Name is required');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const payload = { name: formName.trim() };

      if (editingId) {
        await axios.put(`/api/asset-types/${editingId}`, payload, { withCredentials: true });
      } else {
        await axios.post('/api/asset-types', payload, { withCredentials: true });
      }

      await fetchTypes();
      resetForm();
      onTypeCreated?.();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setError(typeof err.response.data.error === 'string' ? err.response.data.error : 'Save failed');
      } else {
        setError('Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this asset type?')) return;
    try {
      await axios.delete(`/api/asset-types/${id}`, { withCredentials: true });
      await fetchTypes();
      onTypeCreated?.();
    } catch {
      console.error('Failed to delete');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Manage Asset Types</DialogTitle>
          <DialogDescription>Add, edit, or remove asset types.</DialogDescription>
        </DialogHeader>

        {/* List existing types */}
        <ScrollArea className="max-h-[300px]">
          {loading ? (
            <div className="flex justify-center py-6"><Spinner size="sm" /></div>
          ) : assetTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No asset types yet. Add one below.
            </p>
          ) : (
            <div className="space-y-2">
              {assetTypes.map((type) => (
                <div
                  key={type.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{type.name}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(type)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(type.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator />

        {/* Add/Edit Form */}
        {showForm ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                {editingId ? 'Edit Asset Type' : 'New Asset Type'}
              </Label>
              <Button variant="ghost" size="icon-sm" onClick={resetForm}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div>
              <Label htmlFor="typeName" className="text-xs text-muted-foreground">
                Name
              </Label>
              <Input
                id="typeName"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Vehicle, Trailer, Equipment"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  }
                }}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Asset Type
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
