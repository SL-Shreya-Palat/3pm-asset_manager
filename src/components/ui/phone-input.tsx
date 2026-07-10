'use client';

import ReactCountryFlag from 'react-country-flag';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface CountryCode {
  /** ISO 3166-1 alpha-2 code — stored on the record and used for the flag (e.g. 'US'). */
  key: string;
  /** Dial code including '+' (e.g. '+1'). */
  code: string;
  name: string;
}

/** Country dial codes offered by the mobile-number field. */
export const COUNTRY_CODES: CountryCode[] = [
  { key: 'US', code: '+1', name: 'United States' },
  { key: 'CA', code: '+1', name: 'Canada' },
  { key: 'GB', code: '+44', name: 'United Kingdom' },
  { key: 'AU', code: '+61', name: 'Australia' },
  { key: 'NZ', code: '+64', name: 'New Zealand' },
  { key: 'IN', code: '+91', name: 'India' },
  { key: 'CN', code: '+86', name: 'China' },
  { key: 'JP', code: '+81', name: 'Japan' },
  { key: 'DE', code: '+49', name: 'Germany' },
  { key: 'FR', code: '+33', name: 'France' },
  { key: 'BR', code: '+55', name: 'Brazil' },
  { key: 'MX', code: '+52', name: 'Mexico' },
  { key: 'ZA', code: '+27', name: 'South Africa' },
  { key: 'AE', code: '+971', name: 'United Arab Emirates' },
  { key: 'SA', code: '+966', name: 'Saudi Arabia' },
  { key: 'SG', code: '+65', name: 'Singapore' },
  { key: 'KR', code: '+82', name: 'South Korea' },
  { key: 'IT', code: '+39', name: 'Italy' },
  { key: 'ES', code: '+34', name: 'Spain' },
  { key: 'RU', code: '+7', name: 'Russia' },
  { key: 'ID', code: '+62', name: 'Indonesia' },
  { key: 'PH', code: '+63', name: 'Philippines' },
  { key: 'PK', code: '+92', name: 'Pakistan' },
  { key: 'NG', code: '+234', name: 'Nigeria' },
  { key: 'EG', code: '+20', name: 'Egypt' },
  { key: 'MY', code: '+60', name: 'Malaysia' },
];

/** Default country when none is set. */
export const DEFAULT_COUNTRY_KEY = 'US';

/** E.164 format required by 3pm-auth registration (+countrycode then digits). */
export const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/** Resolve a country by key, falling back to the first entry. */
export function getCountry(countryKey: string): CountryCode {
  return COUNTRY_CODES.find((c) => c.key === countryKey) || COUNTRY_CODES[0];
}

/**
 * Combine a country dial code with an entered local number into an E.164 string
 * (e.g. US + "6787678989" → "+16787678989"). Returns '' when no digits were
 * entered (so the phone can stay optional).
 */
export function phoneToE164(countryKey: string, localNumber: string): string {
  const country = getCountry(countryKey);
  const digits = localNumber.replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `${country.code}${digits}` : '';
}

/**
 * True when the (country, local number) pair yields a valid E.164 number.
 * An empty number is considered valid so callers can treat the field as optional.
 */
export function isValidPhoneForCountry(countryKey: string, localNumber: string): boolean {
  if (!localNumber.trim()) return true;
  return E164_REGEX.test(phoneToE164(countryKey, localNumber));
}

/**
 * Split a stored phone string into a country key + national number for editing.
 * Handles E.164 ("+16787678989" → US, "6787678989") by matching the longest
 * dial-code prefix; a value without '+' is treated as a national number under
 * the default country. Falls back to the default country when unparseable.
 */
export function parseE164(phone: string): { countryKey: string; localNumber: string } {
  const trimmed = (phone || '').trim();
  if (!trimmed) return { countryKey: DEFAULT_COUNTRY_KEY, localNumber: '' };
  if (!trimmed.startsWith('+')) {
    return { countryKey: DEFAULT_COUNTRY_KEY, localNumber: trimmed.replace(/\D/g, '') };
  }
  const digits = trimmed.slice(1).replace(/\D/g, '');
  // Longest dial code first so '+971' matches before '+9', '+91' before '+9', etc.
  const byLongestCode = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const c of byLongestCode) {
    const dial = c.code.slice(1); // digits after '+'
    if (digits.startsWith(dial)) {
      return { countryKey: c.key, localNumber: digits.slice(dial.length) };
    }
  }
  return { countryKey: DEFAULT_COUNTRY_KEY, localNumber: digits };
}

interface PhoneInputProps {
  /** Selected country key (e.g. 'US'). */
  countryCode: string;
  onCountryCodeChange: (key: string) => void;
  /** Local number (national part, without the dial code). */
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

/**
 * Reusable mobile-number field: a country dial-code selector (with SVG flags) +
 * a national number input. Store `countryCode` and `value` separately, or
 * combine them for submission with `phoneToE164(countryCode, value)`.
 */
export function PhoneInput({
  countryCode,
  onCountryCodeChange,
  value,
  onValueChange,
  id,
  placeholder = 'Enter mobile number',
  disabled,
  error,
  className,
}: PhoneInputProps) {
  const selected = getCountry(countryCode);

  return (
    <div className={cn('flex gap-2', className)}>
      <Select value={countryCode} onValueChange={onCountryCodeChange} disabled={disabled}>
        <SelectTrigger className="w-[100px] shrink-0">
          <SelectValue>
            <span className="flex items-center gap-1.5">
              <ReactCountryFlag
                countryCode={selected.key}
                svg
                style={{ width: '1.2em', height: '1.2em' }}
                title={selected.name}
              />
              <span className="text-xs">{selected.code}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {COUNTRY_CODES.map((c) => (
            <SelectItem key={c.key} value={c.key}>
              <span className="flex items-center gap-2">
                <ReactCountryFlag
                  countryCode={c.key}
                  svg
                  style={{ width: '1.2em', height: '1.2em' }}
                  title={c.name}
                />
                <span>{c.name}</span>
                <span className="text-muted-foreground">{c.code}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn('flex-1', error && 'border-destructive')}
      />
    </div>
  );
}
