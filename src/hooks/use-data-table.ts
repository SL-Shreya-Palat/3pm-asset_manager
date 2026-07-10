import { useState, useCallback, useMemo } from 'react';
import type { DataTableDensity, DataTableFilterDef } from '@/components/ui/data-table.types';

export interface UseDataTableReturn {
  hiddenColumnKeys: Set<string>;
  setHiddenColumnKeys: (keys: Set<string>) => void;
  density: DataTableDensity;
  setDensity: (d: DataTableDensity) => void;
  filters: Record<string, string | string[]>;
  setFilter: (key: string, value: string | string[]) => void;
  clearFilters: () => void;
  activeFilterCount: number;
}

/**
 * Manages column visibility, density, and filter state for a DataTable.
 *
 * Pass `initialHiddenColumnKeys` to start with certain columns hidden — they
 * still appear (toggleable) in the Columns control, just off by default.
 */
export function useDataTable(
  options?: { initialHiddenColumnKeys?: Iterable<string> },
): UseDataTableReturn {
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<Set<string>>(
    () => new Set(options?.initialHiddenColumnKeys ?? []),
  );
  const [density, setDensity] = useState<DataTableDensity>('default');
  const [filters, setFilters] = useState<Record<string, string | string[]>>({});

  const setFilter = useCallback((key: string, value: string | string[]) => {
    setFilters((prev) => {
      const isEmpty = Array.isArray(value) ? value.length === 0 : value === '';
      if (isEmpty) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  const activeFilterCount = useMemo(
    () => Object.keys(filters).length,
    [filters],
  );

  return {
    hiddenColumnKeys,
    setHiddenColumnKeys,
    density,
    setDensity,
    filters,
    setFilter,
    clearFilters,
    activeFilterCount,
  };
}

/**
 * Apply client-side filters to data rows.
 */
export function applyTableFilters<T>(
  data: T[],
  filters: Record<string, string | string[]>,
  filterDefs: DataTableFilterDef[],
): T[] {
  const activeFilters = filterDefs.filter((def) => filters[def.columnKey] !== undefined);
  if (activeFilters.length === 0) return data;

  return data.filter((row) => {
    const record = row as Record<string, unknown>;
    return activeFilters.every((def) => {
      const value = filters[def.columnKey];
      const cellValue = record[def.columnKey];

      if (def.type === 'text') {
        const search = (value as string).toLowerCase();
        return String(cellValue ?? '').toLowerCase().includes(search);
      }

      if (def.type === 'select') {
        const selected = value as string[];
        if (selected.length === 0) return true;
        // Handle array cell values (e.g. teamNames)
        if (Array.isArray(cellValue)) {
          return cellValue.some((v) => selected.includes(String(v)));
        }
        return selected.includes(String(cellValue ?? ''));
      }

      return true;
    });
  });
}
