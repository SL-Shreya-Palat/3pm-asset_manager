'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const INITIAL_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  roleId: '',
  mobileNumber: '',
};

export function InviteUserDialog({ open, onOpenChange, onSuccess }: InviteUserDialogProps) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [roles, setRoles] = useState<RoleOption[]>([]);

  // Fetch roles for the dropdown
  useEffect(() => {
    if (!open) return;
    async function loadRoles() {
      try {
        const res = await axios.get('/api/roles?limit=100', { withCredentials: true });
        const items = res.data.data?.items || [];
        setRoles(items.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })));
      } catch {
        setRoles([]);
      }
    }
    loadRoles();
  }, [open]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setForm(INITIAL_FORM);
      setErrors({});
    }
  }, [open]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrors({});

    try {
      const body: Record<string, string | undefined> = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        roleId: form.roleId,
      };
      if (form.mobileNumber.trim()) {
        body.mobileNumber = form.mobileNumber;
      }

      await axios.post('/api/users', body, { withCredentials: true });
      onSuccess();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const apiError = err.response.data.error;
        if (typeof apiError === 'object') {
          setErrors(apiError);
        } else {
          setErrors({ _form: String(apiError) });
        }
      } else {
        setErrors({ _form: 'Failed to invite user. Please try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Send an invitation to add a new user to your account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {errors._form && (
            <p className="text-sm text-destructive">{errors._form}</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invite-firstName">First Name *</Label>
              <Input
                id="invite-firstName"
                value={form.firstName}
                onChange={(e) => handleChange('firstName', e.target.value)}
                placeholder="First name"
              />
              {errors.firstName && (
                <p className="text-sm text-destructive">{errors.firstName}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-lastName">Last Name *</Label>
              <Input
                id="invite-lastName"
                value={form.lastName}
                onChange={(e) => handleChange('lastName', e.target.value)}
                placeholder="Last name"
              />
              {errors.lastName && (
                <p className="text-sm text-destructive">{errors.lastName}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-email">Email *</Label>
            <Input
              id="invite-email"
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="user@example.com"
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Role *</Label>
            <Select value={form.roleId} onValueChange={(v) => handleChange('roleId', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.roleId && (
              <p className="text-sm text-destructive">{errors.roleId}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-mobile">Mobile Number</Label>
            <Input
              id="invite-mobile"
              type="tel"
              value={form.mobileNumber}
              onChange={(e) => handleChange('mobileNumber', e.target.value)}
              placeholder="+1 (555) 000-0000"
            />
            {errors.mobileNumber && (
              <p className="text-sm text-destructive">{errors.mobileNumber}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Inviting...' : 'Invite User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
