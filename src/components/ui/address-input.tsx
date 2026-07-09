'use client';

import * as React from 'react';
import { MapPin, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';

export interface AddressSuggestion {
  id: string;
  title: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  fullAddress: string;
}

/**
 * Address field with HERE Maps autocomplete. Stores a single text string (the
 * full address). Built on Radix Popover so the dropdown works inside modal
 * dialogs (a plain body portal would be blocked by the dialog's inert layer).
 */
export function AddressInput({
  value = '',
  onChange,
  onSelect,
  placeholder = 'Start typing an address\u2026',
  disabled,
  id,
  className,
  countryCode,
  debounceMs = 350,
  minChars = 3,
}: {
  value?: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Optional ISO country to bias results (e.g. "NZL"). */
  countryCode?: string;
  debounceMs?: number;
  minChars?: number;
}) {
  const [suggestions, setSuggestions] = React.useState<AddressSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function search(q: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (countryCode) params.set('countryCode', countryCode);
      const res = await fetch(`/api/address/autocomplete?${params.toString()}`);
      const { data } = await res.json();
      const list = (data ?? []) as AddressSuggestion[];
      setSuggestions(list);
      setOpen(list.length > 0);
    } catch {
      setSuggestions([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(v: string) {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < minChars) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(() => void search(v), debounceMs);
  }

  function pick(s: AddressSuggestion) {
    onChange(s.fullAddress);
    onSelect?.(s);
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverAnchor asChild>
        <div ref={wrapRef} className={cn('relative', className)}>
          <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <Input
            id={id}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            autoComplete="off"
            className="pl-8"
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => {
              if (suggestions.length) setOpen(true);
            }}
          />
          {loading && (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (wrapRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        className="p-1"
        style={{ width: 'var(--radix-popper-anchor-width)' }}
      >
        <ul className="max-h-64 overflow-auto">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => pick(s)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
                  'hover:bg-muted',
                )}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">{s.fullAddress}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
