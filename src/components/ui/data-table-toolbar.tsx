'use client';

import { useState } from 'react';
import {
  Filter,
  Columns3,
  Rows3,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { DataTableColumn, DataTableDensity, DataTableFilterDef } from './data-table.types';

/* ── Props ─────────────────────────────────────────────────────────── */

interface DataTableToolbarProps<T> {
  columns: DataTableColumn<T>[];
  hiddenColumnKeys: Set<string>;
  onHiddenColumnKeysChange: (keys: Set<string>) => void;
  density: DataTableDensity;
  onDensityChange: (d: DataTableDensity) => void;
  filterDefs?: DataTableFilterDef[];
  filters?: Record<string, string | string[]>;
  onFilterChange?: (key: string, value: string | string[]) => void;
  onFiltersClear?: () => void;
  /** Optional extra action buttons rendered at the start of the toolbar. */
  actions?: React.ReactNode;
}

/* ── Toolbar ───────────────────────────────────────────────────────── */

export function DataTableToolbar<T>({
  columns,
  hiddenColumnKeys,
  onHiddenColumnKeysChange,
  density,
  onDensityChange,
  filterDefs,
  filters,
  onFilterChange,
  onFiltersClear,
  actions,
}: DataTableToolbarProps<T>) {
  const activeFilterCount = filters ? Object.keys(filters).length : 0;
  const hasFilters = filterDefs && filterDefs.length > 0;

  return (
    <div className="flex items-center gap-2 mb-3">
      {/* Extra actions */}
      {actions}

      {/* Filters */}
      {hasFilters && onFilterChange && (
        <FiltersControl
          filterDefs={filterDefs}
          filters={filters ?? {}}
          onFilterChange={onFilterChange}
          onFiltersClear={onFiltersClear}
          activeCount={activeFilterCount}
        />
      )}

      {/* Column Selection */}
      <ColumnsControl
        columns={columns}
        hiddenColumnKeys={hiddenColumnKeys}
        onHiddenColumnKeysChange={onHiddenColumnKeysChange}
      />

      {/* Density */}
      <DensityControl density={density} onDensityChange={onDensityChange} />
    </div>
  );
}

/* ── Filters Control ───────────────────────────────────────────────── */

function FiltersControl({
  filterDefs,
  filters,
  onFilterChange,
  onFiltersClear,
  activeCount,
}: {
  filterDefs: DataTableFilterDef[];
  filters: Record<string, string | string[]>;
  onFilterChange: (key: string, value: string | string[]) => void;
  onFiltersClear?: () => void;
  activeCount: number;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Filter className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="default" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs rounded-full">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="text-sm font-medium">Filters</p>
          {activeCount > 0 && onFiltersClear && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onFiltersClear}>
              Clear all
            </Button>
          )}
        </div>
        <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
          {filterDefs.map((def) => (
            <div key={def.columnKey}>
              <p className="text-sm font-medium mb-2">{def.label}</p>
              {def.type === 'text' && (
                <Input
                  placeholder={`Filter by ${def.label.toLowerCase()}...`}
                  value={(filters[def.columnKey] as string) ?? ''}
                  onChange={(e) => onFilterChange(def.columnKey, e.target.value)}
                  className="h-8"
                />
              )}
              {def.type === 'select' && def.options && (
                <div className="space-y-1.5">
                  {def.options.map((opt) => {
                    const selected = (filters[def.columnKey] as string[]) ?? [];
                    const isChecked = selected.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1"
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...selected, opt.value]
                              : selected.filter((v) => v !== opt.value);
                            onFilterChange(def.columnKey, next);
                          }}
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Columns Control ───────────────────────────────────────────────── */

function ColumnsControl<T>({
  columns,
  hiddenColumnKeys,
  onHiddenColumnKeysChange,
}: {
  columns: DataTableColumn<T>[];
  hiddenColumnKeys: Set<string>;
  onHiddenColumnKeysChange: (keys: Set<string>) => void;
}) {
  const [search, setSearch] = useState('');

  // All columns except 'actions' appear in the list; pinned ones are shown but disabled
  const listColumns = columns.filter((col) => col.key !== 'actions');
  const toggleableColumns = listColumns.filter((col) => !col.pinned);
  const filtered = search
    ? listColumns.filter((col) => {
        const text = col.label ?? (typeof col.header === 'string' ? col.header : col.key);
        return text.toLowerCase().includes(search.toLowerCase());
      })
    : listColumns;

  const visibleCount = toggleableColumns.filter((col) => !hiddenColumnKeys.has(col.key)).length;

  const handleToggle = (key: string, checked: boolean) => {
    const next = new Set(hiddenColumnKeys);
    if (checked) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onHiddenColumnKeysChange(next);
  };

  const handleShowAll = () => onHiddenColumnKeysChange(new Set());
  const handleHideAll = () =>
    onHiddenColumnKeysChange(new Set(toggleableColumns.map((c) => c.key)));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Columns3 className="h-4 w-4" />
          Columns
          {hiddenColumnKeys.size > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs rounded-full">
              {visibleCount}/{toggleableColumns.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="p-3 border-b">
          <div className="relative">
            <Input
              placeholder="Search columns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleShowAll}>
            Show all
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleHideAll}>
            Hide all
          </Button>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.map((col) => (
            <label
              key={col.key}
              className={`flex items-center gap-2 text-sm rounded px-2 py-1.5 ${
                col.pinned
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer hover:bg-muted/50'
              }`}
            >
              <Checkbox
                checked={col.pinned ? true : !hiddenColumnKeys.has(col.key)}
                disabled={col.pinned}
                onCheckedChange={col.pinned ? undefined : (checked) => handleToggle(col.key, !!checked)}
              />
              {col.label ?? col.header}
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">No columns match</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Density Control ───────────────────────────────────────────────── */

const DENSITY_OPTIONS: { value: DataTableDensity; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'default', label: 'Default' },
  { value: 'comfortable', label: 'Comfortable' },
];

function DensityControl({
  density,
  onDensityChange,
}: {
  density: DataTableDensity;
  onDensityChange: (d: DataTableDensity) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Rows3 className="h-4 w-4" />
          Density
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Row Density</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={density} onValueChange={(v) => onDensityChange(v as DataTableDensity)}>
          {DENSITY_OPTIONS.map((opt) => (
            <DropdownMenuRadioItem key={opt.value} value={opt.value}>
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
