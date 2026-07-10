'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { Button, LoadingButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AddressInput } from '@/components/ui/address-input';
import { Separator } from '@/components/ui/separator';
import { showSuccessToast, showErrorToast } from '@/lib/toastUtils';
import { isValidEmail, isValidPhone } from '@/lib/validation/commonValidators';
import type { VendorRow } from './types';

interface VendorFormProps {
  mode: 'create' | 'edit';
  vendor?: VendorRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function VendorForm({ mode, vendor, onClose, onSaved }: VendorFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields — Vendor Details
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');

  // Primary Contact
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Vendor Type
  const [typeParts, setTypeParts] = useState(false);
  const [typeServices, setTypeServices] = useState(false);

  // Labor Rate
  const [laborRatePerHour, setLaborRatePerHour] = useState('');

  // Populate form with vendor data (edit mode)
  useEffect(() => {
    if (vendor && mode === 'edit') {
      setName(vendor.name || '');
      setAddress(vendor.address || '');
      setWebsite(vendor.website || '');
      setContactName(vendor.contactName || '');
      setPhone(vendor.phone || '');
      setEmail(vendor.email || '');
      setTypeParts(vendor.vendorTypes?.includes('parts') || false);
      setTypeServices(vendor.vendorTypes?.includes('services') || false);
      setLaborRatePerHour(
        vendor.laborRatePerHour != null ? String(vendor.laborRatePerHour) : '',
      );
    }
  }, [vendor, mode]);

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

    // Client-side validation — mirrors the server rules so errors surface
    // immediately, below the relevant field.
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Vendor name is required';
    if (!contactName.trim()) errors.contactName = 'Contact name is required';
    if (email.trim() && !isValidEmail(email.trim())) errors.email = 'Enter a valid email address';
    if (phone.trim() && !isValidPhone(phone.trim())) errors.phone = 'Enter a valid phone number';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const vendorTypes: string[] = [];
    if (typeParts) vendorTypes.push('parts');
    if (typeServices) vendorTypes.push('services');

    const payload = {
      name: name.trim(),
      address: address.trim() || undefined,
      website: website.trim() || undefined,
      contactName: contactName.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      vendorTypes,
      laborRatePerHour: laborRatePerHour ? parseFloat(laborRatePerHour) : undefined,
    };

    try {
      setSaving(true);
      if (mode === 'edit' && vendor) {
        await axios.put(`/api/vendors/${vendor.id}`, payload, { withCredentials: true });
      } else {
        await axios.post('/api/vendors', payload, { withCredentials: true });
      }
      showSuccessToast(mode === 'edit' ? 'Vendor updated successfully' : 'Vendor created successfully');
      onSaved();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const errData = err.response.data.error;
        if (typeof errData === 'object') {
          setFieldErrors(errData as Record<string, string>);
          showErrorToast('Please fix the highlighted errors');
        } else {
          setError(String(errData));
          showErrorToast(String(errData));
        }
      } else {
        setError('Failed to save vendor');
        showErrorToast('Failed to save vendor');
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
          {mode === 'edit' ? 'Edit Vendor' : 'Add Vendor'}
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Form body */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Vendor Details Section */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Vendor Details</h3>
            <Separator className="mb-4" />
            <div className="space-y-4">
              <div>
                <Label htmlFor="vendorName">
                  Vendor Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="vendorName"
                  value={name}
                  onChange={(e) => { setName(e.target.value); clearFieldError('name'); }}
                  placeholder="Enter vendor name"
                  className={`mt-1.5 ${fieldErrors.name ? 'border-destructive' : ''}`}
                />
                {fieldErrors.name && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.name}</p>
                )}
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <AddressInput
                  id="address"
                  value={address}
                  onChange={(v) => { setAddress(v); clearFieldError('address'); }}
                  placeholder="Search address..."
                  className={`mt-1.5 ${fieldErrors.address ? '[&_input]:border-destructive' : ''}`}
                />
                {fieldErrors.address && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.address}</p>
                )}
              </div>
              <div>
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={website}
                  onChange={(e) => { setWebsite(e.target.value); clearFieldError('website'); }}
                  placeholder="https://example.com"
                  className={`mt-1.5 ${fieldErrors.website ? 'border-destructive' : ''}`}
                />
                {fieldErrors.website && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.website}</p>
                )}
              </div>
            </div>
          </div>

          {/* Primary Contact Section */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Primary Contact</h3>
            <Separator className="mb-4" />
            <div className="space-y-4">
              <div>
                <Label htmlFor="contactName">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contactName"
                  value={contactName}
                  onChange={(e) => { setContactName(e.target.value); clearFieldError('contactName'); }}
                  placeholder="Contact person name"
                  className={`mt-1.5 ${fieldErrors.contactName ? 'border-destructive' : ''}`}
                />
                {fieldErrors.contactName && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.contactName}</p>
                )}
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); clearFieldError('phone'); }}
                  placeholder="Phone number"
                  className={`mt-1.5 ${fieldErrors.phone ? 'border-destructive' : ''}`}
                />
                {fieldErrors.phone && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.phone}</p>
                )}
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                  placeholder="Email address"
                  className={`mt-1.5 ${fieldErrors.email ? 'border-destructive' : ''}`}
                />
                {fieldErrors.email && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.email}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Required to assign work orders or defects to this vendor.
                </p>
              </div>
            </div>
          </div>

          {/* Vendor Type Section */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Vendor Type</h3>
            <Separator className="mb-4" />
            <div>
              <Label className="mb-2 block">Vendor Type</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typeParts}
                    onChange={(e) => setTypeParts(e.target.checked)}
                    className="rounded border-border accent-primary"
                  />
                  <span className="text-sm text-foreground">Stock</span>
                  <span className="text-xs text-muted-foreground">- Supplier for purchase orders</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typeServices}
                    onChange={(e) => setTypeServices(e.target.checked)}
                    className="rounded border-border accent-primary"
                  />
                  <span className="text-sm text-foreground">Services</span>
                  <span className="text-xs text-muted-foreground">- Assignable to work orders & defects</span>
                </label>
              </div>
              {fieldErrors.vendorTypes && (
                <p className="text-sm text-destructive mt-1">{fieldErrors.vendorTypes}</p>
              )}
            </div>
          </div>

          {/* Labor Rate Section */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Labor Rate</h3>
            <Separator className="mb-4" />
            <div>
              <Label htmlFor="laborRate">Rate per hour ($)</Label>
              <Input
                id="laborRate"
                type="number"
                step="0.01"
                min="0"
                value={laborRatePerHour}
                onChange={(e) => { setLaborRatePerHour(e.target.value); clearFieldError('laborRatePerHour'); }}
                placeholder="0.00"
                className={`mt-1.5 ${fieldErrors.laborRatePerHour ? 'border-destructive' : ''}`}
              />
              {fieldErrors.laborRatePerHour && (
                <p className="text-sm text-destructive mt-1">{fieldErrors.laborRatePerHour}</p>
              )}
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
        <LoadingButton onClick={handleSubmit} loading={saving}>
          {mode === 'edit' ? 'Update Vendor' : 'Create Vendor'}
        </LoadingButton>
      </div>
    </div>
  );
}
