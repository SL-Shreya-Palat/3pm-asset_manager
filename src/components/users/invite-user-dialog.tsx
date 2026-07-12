'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button, LoadingButton } from '@/components/ui/button';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  PhoneInput,
  phoneToE164,
  isValidPhoneForCountry,
  DEFAULT_COUNTRY_KEY,
} from '@/components/ui/phone-input';
import { isValidEmail } from '@/lib/validation/commonValidators';
import { showSuccessToast, showErrorToast } from '@/lib/toastUtils';
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
  countryCode: DEFAULT_COUNTRY_KEY,
  mobileNumber: '',
};

/** Roles that can't be assigned when inviting a user (hidden from the dropdown). */
const EXCLUDED_ROLE_NAMES = new Set(['owner', 'driver']);

export function InviteUserDialog({ open, onOpenChange, onSuccess }: InviteUserDialogProps) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Fetch roles for the dropdown
  useEffect(() => {
    if (!open) return;
    async function loadRoles() {
      setRolesLoading(true);
      try {
        const res = await axios.get('/api/roles?limit=100', { withCredentials: true });
        const items = res.data.data?.items || [];
        setRoles(
          items
            .filter((r: { name: string }) => !EXCLUDED_ROLE_NAMES.has(r.name.trim().toLowerCase()))
            .map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })),
        );
      } catch {
        setRoles([]);
      } finally {
        setRolesLoading(false);
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

  // Client-side validation — mirrors the server rules in validateInviteUserInput
  // so the user gets immediate feedback (required fields + email/phone format).
  // Duplicate-email prevention is enforced server-side and surfaced via errors.email.
  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (!form.firstName.trim()) next.firstName = 'First name is required';
    if (!form.lastName.trim()) next.lastName = 'Last name is required';

    if (!form.email.trim()) {
      next.email = 'Email is required';
    } else if (!isValidEmail(form.email.trim())) {
      next.email = 'Enter a valid email address';
    }

    if (!form.roleId) next.roleId = 'Role is required';

    if (!isValidPhoneForCountry(form.countryCode, form.mobileNumber)) {
      next.mobileNumber = 'Enter a valid mobile number for the selected country';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

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
        // Send E.164 so 3pm-auth can register the user with the mobile.
        body.mobileNumber = phoneToE164(form.countryCode, form.mobileNumber);
      }

      await axios.post('/api/users', body, { withCredentials: true });
      showSuccessToast('User invited successfully');
      onSuccess();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const apiError = err.response.data.error;
        if (typeof apiError === 'object') {
          setErrors(apiError);
          showErrorToast('Failed to invite user');
        } else {
          setErrors({ _form: String(apiError) });
          showErrorToast(String(apiError));
        }
      } else {
        setErrors({ _form: 'Failed to invite user. Please try again.' });
        showErrorToast('Failed to invite user. Please try again.');
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
              <Label htmlFor="invite-firstName">First Name <span className="text-destructive">*</span></Label>
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
              <Label htmlFor="invite-lastName">Last Name <span className="text-destructive">*</span></Label>
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
            <Label htmlFor="invite-email">Email <span className="text-destructive">*</span></Label>
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
            <Label>Role <span className="text-destructive">*</span></Label>
            <SearchableSelect
              options={roles.map((role) => ({ label: role.name, value: role.id }))}
              loading={rolesLoading}
              value={form.roleId || null}
              onValueChange={(v) => handleChange('roleId', v || '')}
              placeholder="Select a role"
              searchPlaceholder="Search roles..."
              emptyMessage="No roles found"
              isClearable={false}
              error={errors.roleId}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-mobile">Mobile Number</Label>
            <PhoneInput
              id="invite-mobile"
              countryCode={form.countryCode}
              onCountryCodeChange={(v) => handleChange('countryCode', v)}
              value={form.mobileNumber}
              onValueChange={(v) => handleChange('mobileNumber', v)}
              error={!!errors.mobileNumber}
            />
            {errors.mobileNumber && (
              <p className="text-sm text-destructive">{errors.mobileNumber}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Select the country code — the number is registered in 3PM Auth in international format.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <LoadingButton onClick={handleSubmit} loading={submitting}>
            Invite User
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
