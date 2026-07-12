'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  SearchableSelect,
  type SearchableSelectOption,
} from '@/components/ui/searchable-select';

interface LookupSelectProps {
  /** API endpoint to fetch the options from (e.g. '/api/assets?limit=100'). */
  endpoint: string;
  /** Map one raw API item to a dropdown option. */
  mapItem: (item: Record<string, unknown>) => SearchableSelectOption;

  value?: string | null;
  onValueChange?: (value: string | null) => void;

  label?: string;
  required?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  error?: string;
  disabled?: boolean;
  isClearable?: boolean;
  className?: string;

  /**
   * When false, skip the fetch and just use `fallbackOptions`. Useful when the
   * current user can't access the endpoint (e.g. a mechanic whose asset list
   * 403s) — the field is typically also `disabled` and seeded from a record.
   * Defaults to true.
   */
  enabled?: boolean;
  /**
   * Options to show when not fetching (e.g. the current value seeded from an
   * existing record so a disabled field still displays its label).
   */
  fallbackOptions?: SearchableSelectOption[];
}

/**
 * A dropdown that loads its own options and shows a loading state while doing so.
 *
 * Wraps SearchableSelect and drives its `loading` prop from an in-flight fetch,
 * so lookup dropdowns show a spinner instead of appearing empty then suddenly
 * populating. Use it anywhere a select is backed by an API list.
 */
export function LookupSelect({
  endpoint,
  mapItem,
  enabled = true,
  fallbackOptions = [],
  ...selectProps
}: LookupSelectProps) {
  const [options, setOptions] = useState<SearchableSelectOption[]>(fallbackOptions);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setOptions(fallbackOptions);
      return;
    }
    let cancelled = false;
    setLoading(true);
    axios
      .get(endpoint, { withCredentials: true })
      .then((res) => {
        if (cancelled) return;
        const items = (res.data?.data?.items || res.data?.data || []) as Record<string, unknown>[];
        setOptions(items.map(mapItem));
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // fallbackOptions/mapItem are intentionally excluded — they're often inline
    // literals; the fetch should only re-run when the endpoint or enabled change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, enabled]);

  return <SearchableSelect {...selectProps} options={options} loading={loading} />;
}
