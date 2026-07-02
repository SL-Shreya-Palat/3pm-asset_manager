'use client';

import { useState } from 'react';
import {
  Filter,
  Columns3,
  AlignJustify,
  AlignCenter,
  AlignStartVertical,
  X,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  /** Optional search input rendered at the end of the toolbar (right-aligned). */
  searchNode?: React.ReactNode;
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
  searchNode,
}: DataTableToolbarProps<T>) {
  const activeFilterCount = filters ? Object.keys(filters).length : 0;
  const hasFilters = filterDefs && filterDefs.length > 0;

  return (
    <div className="flex items-center gap-2 pt-1 mb-3">
      {/* Extra actions */}
      {actions}

      {/* Table controls — Filters · Columns · Density in one colorful group */}
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-sm">
        {hasFilters && onFilterChange && (
          <>
            <FiltersControl
              filterDefs={filterDefs}
              filters={filters ?? {}}
              onFilterChange={onFilterChange}
              onFiltersClear={onFiltersClear}
              activeCount={activeFilterCount}
            />
            <Separator orientation="vertical" className="h-5" />
          </>
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

      {/* Search (right-aligned) */}
      {searchNode && <div className="ml-auto">{searchNode}</div>}
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
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md py-1 pl-1 pr-2 text-xs font-semibold text-foreground transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40',
            activeCount > 0 && 'bg-blue-50 dark:bg-blue-950/40',
          )}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <Filter className="h-3 w-3" />
          </span>
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="text-sm font-medium">Filters</p>
          {activeCount > 0 && onFiltersClear && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary hover:text-primary" onClick={onFiltersClear}>
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
                <div className="space-y-1">
                  {def.options.map((opt) => {
                    const selected = (filters[def.columnKey] as string[]) ?? [];
                    const isChecked = selected.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5"
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
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-background/80',
                hiddenColumnKeys.size > 0 && 'text-primary hover:text-primary',
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400">
                <Columns3 className="h-3 w-3" />
              </span>
              <span>Columns</span>
              {hiddenColumnKeys.size > 0 && (
                <span className="text-[10px] font-semibold text-primary">
                  {visibleCount}/{toggleableColumns.length}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Toggle column visibility</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-56 p-0">
        <div className="p-2.5 border-b">
          <div className="relative">
            <Input
              placeholder="Search columns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pr-8 text-xs"
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
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b">
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={handleShowAll}>
            Show all
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={handleHideAll}>
            Hide all
          </Button>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.map((col) => {
            const isVisible = col.pinned ? true : !hiddenColumnKeys.has(col.key);
            return (
              <label
                key={col.key}
                className={cn(
                  'flex items-center gap-2 text-sm rounded-md px-2 py-1.5',
                  col.pinned
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer hover:bg-muted/60',
                )}
              >
                <Checkbox
                  checked={isVisible}
                  disabled={col.pinned}
                  onCheckedChange={col.pinned ? undefined : (checked) => handleToggle(col.key, !!checked)}
                />
                <span className="flex-1 truncate">{col.label ?? col.header}</span>
              </label>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">No columns match</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Density Control ───────────────────────────────────────────────── */

const DENSITY_OPTIONS: { value: DataTableDensity; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'compact', label: 'Compact', icon: AlignStartVertical },
  { value: 'default', label: 'Default', icon: AlignCenter },
  { value: 'comfortable', label: 'Comfortable', icon: AlignJustify },
];

function DensityControl({
  density,
  onDensityChange,
}: {
  density: DataTableDensity;
  onDensityChange: (d: DataTableDensity) => void;
}) {
  const currentOption = DENSITY_OPTIONS.find((o) => o.value === density) ?? DENSITY_OPTIONS[1];

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-background/80',
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <currentOption.icon className="h-3 w-3" />
              </span>
              <span>Density</span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Adjust row density</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Row Density</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DENSITY_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = density === opt.value;
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => onDensityChange(opt.value)}
              className={cn('gap-2', isActive && 'bg-primary/10 text-primary')}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="flex-1">{opt.label}</span>
              {isActive && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
