'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { SquarePen, IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ui/date-field';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BaseForm } from '@/components/ui/base-form';
import type { TeamOption } from './types';
import { showSuccessToast, showErrorToast } from '@/lib/toastUtils';

/** Country codes for the mobile number dropdown. */
const COUNTRY_CODES = [
  { key: 'US', code: '+1', name: 'United States', flag: '🇺🇸' },
  { key: 'CA', code: '+1', name: 'Canada', flag: '🇨🇦' },
  { key: 'GB', code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { key: 'AU', code: '+61', name: 'Australia', flag: '🇦🇺' },
  { key: 'NZ', code: '+64', name: 'New Zealand', flag: '🇳🇿' },
  { key: 'IN', code: '+91', name: 'India', flag: '🇮🇳' },
  { key: 'CN', code: '+86', name: 'China', flag: '🇨🇳' },
  { key: 'JP', code: '+81', name: 'Japan', flag: '🇯🇵' },
  { key: 'DE', code: '+49', name: 'Germany', flag: '🇩🇪' },
  { key: 'FR', code: '+33', name: 'France', flag: '🇫🇷' },
  { key: 'BR', code: '+55', name: 'Brazil', flag: '🇧🇷' },
  { key: 'MX', code: '+52', name: 'Mexico', flag: '🇲🇽' },
  { key: 'ZA', code: '+27', name: 'South Africa', flag: '🇿🇦' },
  { key: 'AE', code: '+971', name: 'United Arab Emirates', flag: '🇦🇪' },
  { key: 'SA', code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { key: 'SG', code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { key: 'KR', code: '+82', name: 'South Korea', flag: '🇰🇷' },
  { key: 'IT', code: '+39', name: 'Italy', flag: '🇮🇹' },
  { key: 'ES', code: '+34', name: 'Spain', flag: '🇪🇸' },
  { key: 'RU', code: '+7', name: 'Russia', flag: '🇷🇺' },
  { key: 'ID', code: '+62', name: 'Indonesia', flag: '🇮🇩' },
  { key: 'PH', code: '+63', name: 'Philippines', flag: '🇵🇭' },
  { key: 'PK', code: '+92', name: 'Pakistan', flag: '🇵🇰' },
  { key: 'NG', code: '+234', name: 'Nigeria', flag: '🇳🇬' },
  { key: 'EG', code: '+20', name: 'Egypt', flag: '🇪🇬' },
  { key: 'MY', code: '+60', name: 'Malaysia', flag: '🇲🇾' },
];

/** Currencies for the rate dropdown. */
const CURRENCIES = [
  { code: 'USD', label: 'USD ($)', symbol: '$' },
  { code: 'AUD', label: 'AUD (A$)', symbol: 'A$' },
  { code: 'CAD', label: 'CAD (C$)', symbol: 'C$' },
  { code: 'EUR', label: 'EUR (€)', symbol: '€' },
  { code: 'GBP', label: 'GBP (£)', symbol: '£' },
  { code: 'NZD', label: 'NZD (NZ$)', symbol: 'NZ$' },
  { code: 'OTHER', label: 'Other', symbol: '' },
];

interface DriverFormProps {
  mode: 'create' | 'edit';
  initialData?: Record<string, unknown>;
  driverId?: string;
}

export function DriverForm({ mode, initialData, driverId }: DriverFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [teams, setTeams] = useState<TeamOption[]>([]);

  // Form fields — Personal Details
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [teamId, setTeamId] = useState('');
  const [countryCode, setCountryCode] = useState('US');
  const [mobileNumber, setMobileNumber] = useState('');
  const [homePhone, setHomePhone] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [notes, setNotes] = useState('');

  // Form fields — Employment & License Details
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [jobPosition, setJobPosition] = useState('');
  const [rateCurrency, setRateCurrency] = useState('USD');
  const [ratePerUnit, setRatePerUnit] = useState('');
  const [driverLicense, setDriverLicense] = useState('');
  const [licenseClass, setLicenseClass] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [healthCertificate, setHealthCertificate] = useState('');
  const [otherNotes, setOtherNotes] = useState('');

  // Licence scan
  const licenceInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);

  const handleLicenceScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    try {
      setScanning(true);
      setError('');
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.post('/api/drivers/extract-licence', formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data?.data;
      if (data) {
        if (data.firstName) setFirstName(data.firstName);
        if (data.lastName) setLastName(data.lastName);
        if (data.dateOfBirth) setDateOfBirth(data.dateOfBirth);
        if (data.licenseNumber) setLicenseNumber(data.licenseNumber);
        if (data.licenseClass) setLicenseClass(data.licenseClass);
        if (data.cardVersion) setDriverLicense(data.cardVersion);
        showSuccessToast('Licence details extracted successfully');
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        showErrorToast(String(err.response.data.error));
      } else {
        showErrorToast('Failed to extract licence details. Please try a clearer photo.');
      }
    } finally {
      setScanning(false);
      // Reset input so the same file can be re-selected
      if (licenceInputRef.current) licenceInputRef.current.value = '';
    }
  };

  // Photo upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

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
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Populate form with initial data (edit mode)
  useEffect(() => {
    if (initialData) {
      setFirstName((initialData.firstName as string) || '');
      setLastName((initialData.lastName as string) || '');
      setEmail((initialData.email as string) || '');
      setTeamId((initialData.teamId as string) || '');
      setCountryCode((initialData.countryCode as string) || 'US');
      setMobileNumber((initialData.mobileNumber as string) || '');
      setHomePhone((initialData.homePhone as string) || '');
      setWorkPhone((initialData.workPhone as string) || '');
      setDateOfBirth(
        initialData.dateOfBirth
          ? (initialData.dateOfBirth as string).split('T')[0]
          : '',
      );
      setNotes((initialData.notes as string) || '');
      setEmployeeNumber((initialData.employeeNumber as string) || '');
      setJobPosition((initialData.jobPosition as string) || '');
      setRateCurrency((initialData.rateCurrency as string) || 'USD');
      setRatePerUnit(
        initialData.ratePerUnit != null ? String(initialData.ratePerUnit) : '',
      );
      setDriverLicense((initialData.driverLicense as string) || '');
      setLicenseClass((initialData.licenseClass as string) || '');
      setLicenseNumber((initialData.licenseNumber as string) || '');
      setHealthCertificate((initialData.healthCertificate as string) || '');
      setOtherNotes((initialData.otherNotes as string) || '');

      if (initialData.photoUrl) {
        setPhotoPreview(initialData.photoUrl as string);
      }
    }
  }, [initialData]);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await axios.get('/api/teams?limit=100', { withCredentials: true });
      setTeams(res.data.data?.items || []);
    } catch {
      setTeams([]);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    // Validate required fields
    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = 'First name is required';
    if (!lastName.trim()) errors.lastName = 'Last name is required';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // Handle photo upload if a new file was selected
    let photoUrl: string | undefined;
    if (photoFile) {
      try {
        const formData = new FormData();
        formData.append('file', photoFile);
        const uploadRes = await axios.post('/api/upload', formData, {
          withCredentials: true,
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (uploadRes.data?.data?.url) {
          photoUrl = uploadRes.data.data.url;
        }
      } catch {
        // Continue without photo
      }
    } else if (photoPreview && !photoFile) {
      // Keep existing photo URL in edit mode
      photoUrl = photoPreview;
    }

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || undefined,
      photoUrl: photoUrl || undefined,
      notes: notes.trim() || undefined,
      teamId: teamId || undefined,
      countryCode: countryCode || undefined,
      mobileNumber: mobileNumber.trim() || undefined,
      homePhone: homePhone.trim() || undefined,
      workPhone: workPhone.trim() || undefined,
      dateOfBirth: dateOfBirth || undefined,
      employeeNumber: employeeNumber.trim() || undefined,
      jobPosition: jobPosition.trim() || undefined,
      rateCurrency: rateCurrency || undefined,
      ratePerUnit: ratePerUnit ? parseFloat(ratePerUnit) : undefined,
      otherNotes: otherNotes.trim() || undefined,
      driverLicense: driverLicense.trim() || undefined,
      licenseClass: licenseClass.trim() || undefined,
      licenseNumber: licenseNumber.trim() || undefined,
      healthCertificate: healthCertificate.trim() || undefined,
    };

    try {
      setSaving(true);
      if (mode === 'edit' && driverId) {
        await axios.put(`/api/drivers/${driverId}`, payload, { withCredentials: true });
      } else {
        await axios.post('/api/drivers', payload, { withCredentials: true });
      }
      showSuccessToast(mode === 'edit' ? 'Driver updated successfully' : 'Driver created successfully');
      router.push('/people/drivers');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const errData = err.response.data.error;
        if (typeof errData === 'object') {
          setFieldErrors(errData as Record<string, string>);
        } else {
          showErrorToast(String(errData));
          setError(String(errData));
        }
      } else {
        showErrorToast('Failed to save driver');
        setError('Failed to save driver');
      }
    } finally {
      setSaving(false);
    }
  };

  // Find selected country for display
  const selectedCountry = COUNTRY_CODES.find((c) => c.key === countryCode) || COUNTRY_CODES[0];

  return (
    <BaseForm
      title={mode === 'edit' ? 'Edit Driver' : 'Add Driver'}
      subtitle={
        mode === 'edit'
          ? 'Update the driver details below'
          : 'Fill in the details to add a new driver'
      }
      onBack={() => router.push('/people/drivers')}
      onSubmit={handleSubmit}
      saving={saving}
      submitLabel={mode === 'edit' ? 'Update Driver' : 'Create Driver'}
      fileInputRef={fileInputRef}
      onPhotoChange={handlePhotoChange}
      photoPreview={photoPreview}
      photoAlt="Driver photo"
      nameFields={
        <div className="grid grid-cols-2 gap-4">
          <div className="group">
            <Label htmlFor="firstName" className="text-sm font-medium text-muted-foreground mb-1">
              First Name <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  if (fieldErrors.firstName) setFieldErrors((prev) => { const { firstName: _, ...rest } = prev; return rest; });
                }}
                placeholder="Enter first name"
                className={`text-lg font-semibold border-transparent bg-transparent shadow-none px-2 h-auto py-1.5 focus-visible:border-input focus-visible:bg-background focus-visible:shadow-sm hover:border-input hover:bg-background transition-all pr-9 ${fieldErrors.firstName ? 'border-destructive' : ''}`}
              />
              <SquarePen className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
            {fieldErrors.firstName && (
              <p className="text-sm text-destructive mt-1">{fieldErrors.firstName}</p>
            )}
          </div>
          <div className="group">
            <Label htmlFor="lastName" className="text-sm font-medium text-muted-foreground mb-1">
              Last Name <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  if (fieldErrors.lastName) setFieldErrors((prev) => { const { lastName: _, ...rest } = prev; return rest; });
                }}
                placeholder="Enter last name"
                className={`text-lg font-semibold border-transparent bg-transparent shadow-none px-2 h-auto py-1.5 focus-visible:border-input focus-visible:bg-background focus-visible:shadow-sm hover:border-input hover:bg-background transition-all pr-9 ${fieldErrors.lastName ? 'border-destructive' : ''}`}
              />
              <SquarePen className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
            {fieldErrors.lastName && (
              <p className="text-sm text-destructive mt-1">{fieldErrors.lastName}</p>
            )}
          </div>
        </div>
      }
      sections={[
        {
          title: 'Personal Details',
          children: (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((prev) => { const { email: _, ...rest } = prev; return rest; });
                  }}
                  placeholder="Email address"
                  className={`mt-1.5 ${fieldErrors.email ? 'border-destructive' : ''}`}
                />
                {fieldErrors.email && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.email}</p>
                )}
              </div>
              <div>
                <Label htmlFor="teamId">Team</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Team</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <DateField id="dateOfBirth" label="Date of Birth" value={dateOfBirth} onChange={setDateOfBirth} placeholder="Select date" />
              </div>
              <div className="col-span-2">
                <Label htmlFor="mobileNumber">Mobile Number</Label>
                <div className="flex gap-2 mt-1.5">
                  <Select value={countryCode} onValueChange={setCountryCode}>
                    <SelectTrigger className="w-[80px] shrink-0">
                      <SelectValue>
                        <span className="text-base">{selectedCountry.flag}</span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {COUNTRY_CODES.map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          <span className="flex items-center gap-2">
                            <span className="text-base">{c.flag}</span>
                            <span>{c.name}</span>
                            <span className="text-muted-foreground">{c.code}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-sm text-muted-foreground shrink-0">{selectedCountry.code}</span>
                    <Input
                      id="mobileNumber"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      placeholder="Phone number"
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="homePhone">Home Phone</Label>
                <Input
                  id="homePhone"
                  value={homePhone}
                  onChange={(e) => setHomePhone(e.target.value)}
                  placeholder="Home phone"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="workPhone">Work Phone</Label>
                <Input
                  id="workPhone"
                  value={workPhone}
                  onChange={(e) => setWorkPhone(e.target.value)}
                  placeholder="Work phone"
                  className="mt-1.5"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes..."
                  rows={3}
                  className="mt-1.5"
                />
              </div>
            </div>
          ),
        },
        {
          title: 'Employment & License Details',
          headerRight: (
            <>
              <input
                ref={licenceInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLicenceScan}
              />
              <Button
                type="button"
                size="sm"
                disabled={scanning}
                onClick={() => licenceInputRef.current?.click()}
              >
                {scanning ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <IdCard className="h-4 w-4" />
                )}
                {scanning ? 'Scanning...' : 'Scan Licence'}
              </Button>
            </>
          ),
          children: (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="employeeNumber">Employee Number</Label>
                <Input
                  id="employeeNumber"
                  value={employeeNumber}
                  onChange={(e) => setEmployeeNumber(e.target.value)}
                  placeholder="Employee #"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="jobPosition">Job Position</Label>
                <Input
                  id="jobPosition"
                  value={jobPosition}
                  onChange={(e) => setJobPosition(e.target.value)}
                  placeholder="Position"
                  className="mt-1.5"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="ratePerUnit">Rate per mi/hr</Label>
                <div className="flex gap-2 mt-1.5">
                  <Select value={rateCurrency} onValueChange={setRateCurrency}>
                    <SelectTrigger className="w-[130px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="ratePerUnit"
                    type="number"
                    step="0.01"
                    min="0"
                    value={ratePerUnit}
                    onChange={(e) => setRatePerUnit(e.target.value)}
                    placeholder="0.00"
                    className="flex-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="driverLicense">Driver License</Label>
                <Input
                  id="driverLicense"
                  value={driverLicense}
                  onChange={(e) => setDriverLicense(e.target.value)}
                  placeholder="License"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="licenseClass">License Class</Label>
                <Input
                  id="licenseClass"
                  value={licenseClass}
                  onChange={(e) => setLicenseClass(e.target.value)}
                  placeholder="Class"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="licenseNumber">License Number</Label>
                <Input
                  id="licenseNumber"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="License #"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="healthCertificate">Health Certificate</Label>
                <Input
                  id="healthCertificate"
                  value={healthCertificate}
                  onChange={(e) => setHealthCertificate(e.target.value)}
                  placeholder="Certificate info"
                  className="mt-1.5"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="otherNotes">Other Notes</Label>
                <Textarea
                  id="otherNotes"
                  value={otherNotes}
                  onChange={(e) => setOtherNotes(e.target.value)}
                  placeholder="Additional notes..."
                  rows={3}
                  className="mt-1.5"
                />
              </div>
            </div>
          ),
        },
      ]}
      error={error}
    />
  );
}
