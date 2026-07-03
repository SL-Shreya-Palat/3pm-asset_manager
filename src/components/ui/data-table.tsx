'use client';

import { type ReactNode, useMemo, useCallback, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { TableSkeleton } from '@/components/ui/skeleton';
import { TablePagination } from '@/components/ui/table-pagination';
import type { DataTableProps, DataTableDensity, DataTableSortState } from './data-table.types';

export type { DataTableColumn, DataTablePagination, DataTableProps, DataTableDensity, DataTableFilterDef, DataTableFilterOption, DataTableSortState, DataTableSortDirection } from './data-table.types';

const DENSITY_PADDING: Record<DataTableDensity, string> = {
  compact: 'px-3 py-1.5',
  default: 'px-4 py-3',
  comfortable: 'px-5 py-4',
};

export function DataTable<T>({
  columns,
  data,
  pagination,
  loading,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPage,
  onRowClick,
  rowKey,
  emptyMessage = 'No results found.',
  className,
  density = 'default',
  hiddenColumnKeys,
  selectable,
  selectedKeys,
  onSelectedKeysChange,
}: DataTableProps<T>) {
  const getRowKey = rowKey ?? ((row: T) => (row as Record<string, unknown>).id as string);

  const [sort, setSort] = useState<DataTableSortState | null>(null);

  const visibleColumns = useMemo(
    () =>
      hiddenColumnKeys && hiddenColumnKeys.size > 0
        ? columns.filter((col) => !hiddenColumnKeys.has(col.key))
        : columns,
    [columns, hiddenColumnKeys],
  );

  // Case-insensitive client-side sort
  const sortedData = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return data;

    return [...data].sort((a, b) => {
      let valA: unknown;
      let valB: unknown;

      if (col.sortValue) {
        valA = col.sortValue(a);
        valB = col.sortValue(b);
      } else {
        valA = (a as Record<string, unknown>)[col.key];
        valB = (b as Record<string, unknown>)[col.key];
      }

      // Nulls / undefined → push to end
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      // Numeric comparison
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sort.direction === 'asc' ? valA - valB : valB - valA;
      }

      // Case-insensitive string comparison (localeCompare)
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      const cmp = strA.localeCompare(strB);
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [data, sort, columns]);

  const handleSort = useCallback((key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null; // third click clears sort
    });
  }, []);

  const showCheckboxes = selectable && selectedKeys && onSelectedKeysChange;
  const colCount = visibleColumns.length + (showCheckboxes ? 1 : 0);
  const padding = DENSITY_PADDING[density];

  // Selection helpers
  const allSelected = showCheckboxes && sortedData.length > 0 && sortedData.every((row) => selectedKeys.has(getRowKey(row)));
  const someSelected = showCheckboxes && sortedData.some((row) => selectedKeys.has(getRowKey(row)));

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (!onSelectedKeysChange) return;
      if (checked) {
        const next = new Set(selectedKeys);
        data.forEach((row) => next.add(getRowKey(row)));
        onSelectedKeysChange(next);
      } else {
        const next = new Set(selectedKeys);
        data.forEach((row) => next.delete(getRowKey(row)));
        onSelectedKeysChange(next);
      }
    },
    [data, getRowKey, onSelectedKeysChange, selectedKeys],
  );

  const handleSelectRow = useCallback(
    (key: string, checked: boolean) => {
      if (!onSelectedKeysChange || !selectedKeys) return;
      const next = new Set(selectedKeys);
      if (checked) next.add(key);
      else next.delete(key);
      onSelectedKeysChange(next);
    },
    [onSelectedKeysChange, selectedKeys],
  );

  return (
    <div className={cn('rounded-sm border bg-card shadow-sm overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {showCheckboxes && (
                <th className={cn('w-[40px]', padding)}>
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={(checked) => handleSelectAll(checked === true)}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {visibleColumns.map((col) => {
                const isSortable = col.sortable === true;
                const isSorted = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    className={cn(
                      'text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap',
                      padding,
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                          ? 'text-center'
                          : 'text-left',
                      col.className,
                      isSortable && 'cursor-pointer select-none hover:text-foreground transition-colors',
                      col.key === 'actions' && 'sticky right-0 z-20 bg-muted shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]',
                    )}
                    onClick={isSortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className={cn('inline-flex items-center gap-1', isSortable && 'group')}>
                      {col.header}
                      {isSortable && (
                        isSorted ? (
                          sort.direction === 'asc'
                            ? <ArrowUp className="h-3 w-3 text-foreground" />
                            : <ArrowDown className="h-3 w-3 text-foreground" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                        )
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton columns={colCount} rows={5} />
            ) : sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="text-center py-12 text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row) => {
                const key = getRowKey(row);
                const isSelected = showCheckboxes && selectedKeys.has(key);
                return (
                  <tr
                    key={key}
                    className={cn(
                      'group border-b last:border-0 hover:bg-muted/30 transition-colors',
                      onRowClick && 'cursor-pointer',
                      isSelected && 'bg-muted/40',
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {showCheckboxes && (
                      <td className={cn('w-[40px]', padding)} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleSelectRow(key, checked === true)}
                          aria-label={`Select row ${key}`}
                        />
                      </td>
                    )}
                    {visibleColumns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          'whitespace-nowrap',
                          padding,
                          col.align === 'right'
                            ? 'text-right'
                            : col.align === 'center'
                              ? 'text-center'
                              : '',
                          col.className,
                          col.key === 'actions' && cn(
                            'sticky right-0 z-10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]',
                            isSelected ? 'bg-muted/40' : 'bg-card group-hover:bg-muted/50',
                          ),
                        )}
                      >
                        {col.render
                          ? col.render(row)
                          : ((row as Record<string, unknown>)[col.key] as ReactNode) ?? '—'}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={pagination.page}
        limit={rowsPerPage}
        total={pagination.total}
        onPageChange={onPageChange}
        onRowsPerPageChange={onRowsPerPageChange}
      />
    </div>
  );
}
