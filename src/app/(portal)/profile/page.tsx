'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth/store';
import axios from 'axios';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AddressInput } from '@/components/ui/address-input';
import { PageBackButton } from '@/components/ui/page-back-button';
import { User, Camera, Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useAuth();
  const checkAuth = useAuthStore((s) => s.checkAuth);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Editable fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  // Keep parsed components for API persistence
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [addrState, setAddrState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');

  // Photo upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Sync form state from user data
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setPhoneNumber(user.phoneNumber || '');
      setProfileImageUrl(user.profileImageUrl || null);
      setPhotoPreview(user.profileImageUrl || null);
      setAddressLine1(user.address?.addressLine1 || '');
      setCity(user.address?.city || '');
      setAddrState(user.address?.state || '');
      setPostalCode(user.address?.postalCode || '');
      setCountry(user.address?.country || '');
      // Build display address from stored components
      const parts = [
        user.address?.addressLine1,
        user.address?.city,
        user.address?.state,
        user.address?.postalCode,
        user.address?.country,
      ].filter(Boolean);
      setAddress(parts.join(', '));
    }
  }, [user]);

  const handleCancel = () => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setPhoneNumber(user.phoneNumber || '');
      setProfileImageUrl(user.profileImageUrl || null);
      setPhotoPreview(user.profileImageUrl || null);
      setPhotoFile(null);
      setAddressLine1(user.address?.addressLine1 || '');
      setCity(user.address?.city || '');
      setAddrState(user.address?.state || '');
      setPostalCode(user.address?.postalCode || '');
      setCountry(user.address?.country || '');
      const parts = [
        user.address?.addressLine1,
        user.address?.city,
        user.address?.state,
        user.address?.postalCode,
        user.address?.country,
      ].filter(Boolean);
      setAddress(parts.join(', '));
    }
    setEditing(false);
    setError('');
  };

  const handlePhotoClick = () => {
    if (editing) fileInputRef.current?.click();
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required');
      return;
    }

    try {
      setSaving(true);

      // Upload photo if a new file was selected
      let finalImageUrl = profileImageUrl;
      if (photoFile) {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', photoFile);
        const uploadRes = await axios.post('/api/upload', formData, {
          withCredentials: true,
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (uploadRes.data?.data?.url) {
          finalImageUrl = uploadRes.data.data.url;
        }
        setUploading(false);
      }

      // PATCH profile
      await axios.patch(
        '/api/profile',
        {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phoneNumber: phoneNumber.trim() || null,
          profileImageUrl: finalImageUrl,
          address: {
            addressLine1: addressLine1.trim() || undefined,
            city: city.trim() || undefined,
            state: addrState.trim() || undefined,
            postalCode: postalCode.trim() || undefined,
            country: country.trim() || undefined,
          },
        },
        { withCredentials: true },
      );

      // Refresh auth store so header reflects changes
      await checkAuth();

      setPhotoFile(null);
      setEditing(false);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('Failed to update profile');
      }
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  if (!user) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  const roleLabel = user.tenant?.roleName || 'Member';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="p-6 max-w-2xl">
      {/* Header with Edit / Save+Cancel */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PageBackButton onClick={() => router.back()} />
          <div>
          <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your personal information and settings
          </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={handleCancel} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    {uploading ? 'Uploading...' : 'Saving...'}
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card shadow-sm">
        {/* Profile Photo */}
        <div className="p-6 flex items-center gap-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={handlePhotoClick}
            disabled={!editing}
            className={`relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 overflow-hidden ${
              editing
                ? 'border-dashed border-border cursor-pointer hover:border-primary/50 transition-colors'
                : 'border-border'
            }`}
          >
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Profile photo"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/10">
                <User className="h-8 w-8 text-primary" />
              </div>
            )}
            {editing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                <Camera className="h-5 w-5 text-white" />
              </div>
            )}
          </button>
          <div>
            <p className="text-lg font-semibold text-foreground">
              {editing ? `${firstName} ${lastName}` : `${user.firstName} ${user.lastName}`}
            </p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            {user.tenant && (
              <p className="text-xs text-muted-foreground mt-1">{user.tenant.name}</p>
            )}
          </div>
        </div>

        <Separator />

        {/* Personal Information */}
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName" className="text-muted-foreground">
                First Name
              </Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                readOnly={!editing}
                className={`mt-1.5 ${!editing ? 'bg-muted/50' : ''}`}
              />
            </div>
            <div>
              <Label htmlFor="lastName" className="text-muted-foreground">
                Last Name
              </Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                readOnly={!editing}
                className={`mt-1.5 ${!editing ? 'bg-muted/50' : ''}`}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="email" className="text-muted-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={user.email || ''}
              readOnly
              className="mt-1.5 bg-muted/50"
            />
          </div>

          <div>
            <Label htmlFor="phoneNumber" className="text-muted-foreground">
              Phone Number
            </Label>
            <Input
              id="phoneNumber"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              readOnly={!editing}
              placeholder={editing ? 'e.g. +1 (555) 123-4567' : ''}
              className={`mt-1.5 ${!editing ? 'bg-muted/50' : ''}`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="role" className="text-muted-foreground">
                Role
              </Label>
              <Input
                id="role"
                value={roleLabel}
                readOnly
                className="mt-1.5 bg-muted/50"
              />
            </div>
            <div>
              <Label htmlFor="timezone" className="text-muted-foreground">
                Time Zone
              </Label>
              <Input
                id="timezone"
                value={timezone}
                readOnly
                className="mt-1.5 bg-muted/50"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Address */}
        <div className="p-6 space-y-5">
          <h2 className="text-base font-semibold text-foreground">Address</h2>

          <div>
            <Label htmlFor="address" className="text-muted-foreground">
              Address
            </Label>
            {editing ? (
              <AddressInput
                id="address"
                value={address}
                onChange={setAddress}
                onSelect={(s) => {
                  setAddress(s.fullAddress);
                  setAddressLine1(s.address);
                  setCity(s.city);
                  setAddrState(s.state);
                  setPostalCode(s.postalCode);
                  setCountry(s.country);
                }}
                placeholder="Search address..."
                className="mt-1.5"
              />
            ) : (
              <Input
                id="address"
                value={address}
                readOnly
                className="mt-1.5 bg-muted/50"
              />
            )}
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mt-4 rounded-md bg-destructive/10 border border-destructive/20 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}
