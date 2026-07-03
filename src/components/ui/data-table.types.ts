import { type ReactNode } from 'react';

/* ── Density ───────────────────────────────────────────────────────── */

export type DataTableDensity = 'compact' | 'default' | 'comfortable';

/* ── Filter definition ─────────────────────────────────────────────── */

export interface DataTableFilterOption {
  label: string;
  value: string;
}

export interface DataTableFilterDef {
  /** Column key this filter applies to. */
  columnKey: string;
  /** Display label for the filter. */
  label: string;
  /** Filter type: text input or multi-select. */
  type: 'text' | 'select';
  /** Options for 'select' type filters. */
  options?: DataTableFilterOption[];
}

/* ── Column definition ─────────────────────────────────────────────── */

export interface DataTableColumn<T> {
  /** Unique key. Also used as data accessor when `render` is omitted. */
  key: string;
  /** Column header text or ReactNode. */
  header: ReactNode;
  /** Display label for column toggle UI. Falls back to `header`. */
  label?: string;
  /** Custom cell renderer. Falls back to `row[key] ?? '—'`. */
  render?: (row: T) => ReactNode;
  /** Column alignment. Defaults to "left". */
  align?: 'left' | 'center' | 'right';
  /** Extra CSS class applied to both <th> and <td>. */
  className?: string;
  /** When true, column is always visible and cannot be toggled off. */
  pinned?: boolean;
  /** Enable sorting for this column. Uses case-insensitive string comparison by default. */
  sortable?: boolean;
  /** Custom sort value extractor. Returns the value to sort by from a row. */
  sortValue?: (row: T) => string | number | null | undefined;
}

/* ── Sort types ────────────────────────────────────────────────────── */

export type DataTableSortDirection = 'asc' | 'desc';

export interface DataTableSortState {
  key: string;
  direction: DataTableSortDirection;
}

/* ── Pagination shape (matches API response format) ────────────────── */

export interface DataTablePagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

/* ── Component props ───────────────────────────────────────────────── */

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  pagination: DataTablePagination;
  loading: boolean;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  rowsPerPage: number;
  /** When provided, rows get cursor-pointer styling. */
  onRowClick?: (row: T) => void;
  /** React key extractor. Defaults to `(row) => row.id`. */
  rowKey?: (row: T) => string;
  /** Empty-state content shown when data is empty and not loading. */
  emptyMessage?: ReactNode;
  className?: string;
  /** Row density. Defaults to "default". */
  density?: DataTableDensity;
  /** Set of column keys to hide. */
  hiddenColumnKeys?: Set<string>;
  /** Enable row selection checkboxes. */
  selectable?: boolean;
  /** Currently selected row keys. */
  selectedKeys?: Set<string>;
  /** Called when selection changes. */
  onSelectedKeysChange?: (keys: Set<string>) => void;
}
