'use client';

import { type ReactNode, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { TableSkeleton } from '@/components/ui/skeleton';
import { TablePagination } from '@/components/ui/table-pagination';
import type { DataTableProps, DataTableDensity } from './data-table.types';

export type { DataTableColumn, DataTablePagination, DataTableProps, DataTableDensity, DataTableFilterDef, DataTableFilterOption } from './data-table.types';

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

  const visibleColumns = useMemo(
    () =>
      hiddenColumnKeys && hiddenColumnKeys.size > 0
        ? columns.filter((col) => !hiddenColumnKeys.has(col.key))
        : columns,
    [columns, hiddenColumnKeys],
  );

  const showCheckboxes = selectable && selectedKeys && onSelectedKeysChange;
  const colCount = visibleColumns.length + (showCheckboxes ? 1 : 0);
  const padding = DENSITY_PADDING[density];

  // Selection helpers
  const allSelected = showCheckboxes && data.length > 0 && data.every((row) => selectedKeys.has(getRowKey(row)));
  const someSelected = showCheckboxes && data.some((row) => selectedKeys.has(getRowKey(row)));

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
    <div className={cn('rounded-lg border bg-card shadow-md overflow-hidden', className)}>
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
              {visibleColumns.map((col) => (
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
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton columns={colCount} rows={5} />
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="text-center py-12 text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const key = getRowKey(row);
                const isSelected = showCheckboxes && selectedKeys.has(key);
                return (
                  <tr
                    key={key}
                    className={cn(
                      'border-b last:border-0 hover:bg-muted/30 transition-colors',
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
