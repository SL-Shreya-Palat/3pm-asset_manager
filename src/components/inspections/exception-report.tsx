'use client';

/**
 * Exception Report — a Whip Around-style COMPLIANCE CALENDAR. Rows are
 * asset × form; columns are days across the selected range. Each cell shows the
 * inspection status for that asset/form on that day and opens a popup with the
 * available actions (View inspection / View asset). Actions are limited to the
 * ones that are fully wired end-to-end — placeholder "coming soon" items are not
 * shown.
 *
 * The grid is computed on the fly by /api/exception-report from inspection
 * submissions — only "inspected"/"exception" cells come from the server; the
 * empty days (missed / due today / upcoming) are derived here from day-vs-today.
 *
 * Controls mirror the spec: date range, form + team pickers, row-size, and a
 * "Reminders only" toggle that hides rows with nothing to action.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { format, parseISO, subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import {
  Calendar as CalendarIcon,
  ChevronDown,
  Truck,
  ClipboardList,
  FileText,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useSyncSubmissions } from '@/hooks/use-sync-submissions';
import { InspectionDetailDialog } from '@/components/inspections/inspection-history';
import type {
  CellStatus,
  ExceptionCell,
  ExceptionReportData,
} from '@/components/inspections/exception-report-types';

// ── Row-size presets ────────────────────────────────────────────────────────
type RowSize = 'large' | 'medium' | 'small';
const SIZE: Record<RowSize, { col: number; cell: string; pad: string; text: string }> = {
  large: { col: 54, cell: 'h-9', pad: 'py-3', text: 'text-sm' },
  medium: { col: 46, cell: 'h-7', pad: 'py-2', text: 'text-[13px]' },
  small: { col: 38, cell: 'h-5', pad: 'py-1', text: 'text-xs' },
};
// Frozen (sticky) label-column widths. Narrower on phones so the day cells stay
// visible without scrolling past a wall of frozen columns.
const ASSET_COL = 190;
const FORM_COL = 230;
const ASSET_COL_MOBILE = 116;
const FORM_COL_MOBILE = 128;

// ── Cell appearance + labels ────────────────────────────────────────────────
const CELL_CLASS: Record<CellStatus, string> = {
  inspected: 'bg-emerald-500 hover:bg-emerald-600',
  exception: 'bg-red-500 hover:bg-red-600',
  missed: 'bg-muted hover:bg-muted-foreground/25',
  due: 'bg-muted ring-1 ring-inset ring-primary hover:bg-muted-foreground/25',
  upcoming: 'bg-muted/40 hover:bg-muted',
};
const STATUS_LABEL: Record<CellStatus, string> = {
  inspected: 'Inspected',
  exception: 'Exception',
  missed: 'Missed',
  due: 'Due today',
  upcoming: 'Upcoming',
};
const STATUS_HEADER_CLASS: Record<CellStatus, string> = {
  inspected: 'text-emerald-600',
  exception: 'text-red-600',
  missed: 'text-primary',
  due: 'text-primary',
  upcoming: 'text-muted-foreground',
};

/** Derive a rendered cell's status from its (maybe absent) submission-backed cell. */
function statusOf(cell: ExceptionCell | undefined, day: string, today: string): CellStatus {
  if (cell) return cell.status;
  if (day < today) return 'missed';
  if (day === today) return 'due';
  return 'upcoming';
}

interface Option {
  value: string;
  label: string;
}

interface ActiveCell {
  rect: { left: number; top: number; width: number; height: number };
  assetId: string;
  assetName: string;
  formTitle: string;
  day: string;
  status: CellStatus;
  cell?: ExceptionCell;
}

export function ExceptionReport() {
  const router = useRouter();

  // Default window: the last 7 days ending today (matches the mock).
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    return { from: subDays(to, 6), to };
  });
  const fromStr = range?.from ? format(range.from, 'yyyy-MM-dd') : '';
  const toStr = range?.to ? format(range.to, 'yyyy-MM-dd') : fromStr;

  const [formIds, setFormIds] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [rowSize, setRowSize] = useState<RowSize>('large');
  const [remindersOnly, setRemindersOnly] = useState(false);

  const [formOptions, setFormOptions] = useState<Option[]>([]);
  const [teamOptions, setTeamOptions] = useState<Option[]>([]);

  const [data, setData] = useState<ExceptionReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const [active, setActive] = useState<ActiveCell | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Picker sources (once).
  useEffect(() => {
    axios
      .get('/api/forms?limit=1000&includeSchema=false', { withCredentials: true })
      .then((r) => {
        const items = r.data?.data?.items ?? [];
        setFormOptions(
          items.map((f: { formId: string; title?: string; formTitle?: string }) => ({
            value: f.formId,
            label: f.title || f.formTitle || 'Untitled form',
          })),
        );
      })
      .catch(() => setFormOptions([]));
    axios
      .get('/api/teams?limit=1000', { withCredentials: true })
      .then((r) => {
        const items = r.data?.data?.items ?? [];
        setTeamOptions(items.map((t: { id: string; name: string }) => ({ value: t.id, label: t.name })));
      })
      .catch(() => setTeamOptions([]));
  }, []);

  const fetchData = useCallback(async () => {
    if (!fromStr || !toStr) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: fromStr, to: toStr, tz: String(new Date().getTimezoneOffset()) });
      if (formIds.length) params.set('formIds', formIds.join(','));
      if (teamIds.length) params.set('teamIds', teamIds.join(','));
      const res = await axios.get(`/api/exception-report?${params.toString()}`, { withCredentials: true });
      setData(res.data.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fromStr, toStr, formIds, teamIds]);

  // Defer so setState isn't called synchronously inside the effect body.
  useEffect(() => {
    const t = setTimeout(() => fetchData(), 0);
    return () => clearTimeout(t);
  }, [fetchData]);

  // Pull new submissions so the grid stays current without a manual sync.
  useSyncSubmissions(() => fetchData());

  const openCell = (e: React.MouseEvent<HTMLButtonElement>, a: Omit<ActiveCell, 'rect'>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setActive({ ...a, rect: { left: r.left, top: r.top, width: r.width, height: r.height } });
  };

  const onViewInspection = (a: ActiveCell) => {
    setActive(null);
    if (a.cell?.submissionId) setDetailId(a.cell.submissionId);
  };
  const onViewAsset = (a: ActiveCell) => {
    setActive(null);
    router.push(`/assets/${a.assetId}`);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Exception Report"
        description="Inspection compliance across your fleet — every asset, every form, day by day"
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4 sm:px-6">
        <DateRangeButton range={range} onChange={setRange} />
        <MultiSelectButton
          icon={ClipboardList}
          label="Select forms to display"
          allLabel="All forms"
          options={formOptions}
          selected={formIds}
          onChange={setFormIds}
        />
        <MultiSelectButton
          icon={Truck}
          label="Select teams to display"
          allLabel="All teams"
          options={teamOptions}
          selected={teamIds}
          onChange={setTeamIds}
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Row size:</span>
          <RowSizeToggle value={rowSize} onChange={setRowSize} />
        </div>
        <div className="ml-auto">
          <Switch checked={remindersOnly} onChange={setRemindersOnly} label="Reminders only:" />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-hidden px-4 pb-8 sm:px-6">
        {loading ? (
          <GridSkeleton />
        ) : !data || data.assets.length === 0 || data.days.length === 0 ? (
          <EmptyState hasForms={formOptions.length > 0} />
        ) : (
          <Grid
            data={data}
            rowSize={rowSize}
            remindersOnly={remindersOnly}
            onCellClick={openCell}
          />
        )}
      </div>

      {/* Shared cell popup (single Popover anchored to the clicked cell) */}
      <Popover open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <PopoverAnchor asChild>
          <div
            style={{
              position: 'fixed',
              left: active?.rect.left ?? -9999,
              top: active?.rect.top ?? -9999,
              width: active?.rect.width ?? 0,
              height: active?.rect.height ?? 0,
              pointerEvents: 'none',
            }}
          />
        </PopoverAnchor>
        <PopoverContent align="start" side="bottom" sideOffset={6} className="w-60 p-0">
          {active && (
            <CellMenu
              active={active}
              onViewInspection={onViewInspection}
              onViewAsset={onViewAsset}
            />
          )}
        </PopoverContent>
      </Popover>

      {/* Inspection detail (reused from Inspection History) */}
      <InspectionDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

// ── The calendar grid ─────────────────────────────────────────────────────────
function Grid({
  data,
  rowSize,
  remindersOnly,
  onCellClick,
}: {
  data: ExceptionReportData;
  rowSize: RowSize;
  remindersOnly: boolean;
  onCellClick: (e: React.MouseEvent<HTMLButtonElement>, a: Omit<ActiveCell, 'rect'>) => void;
}) {
  const s = SIZE[rowSize];
  const todayIdx = data.days.indexOf(data.today);
  const isMobile = useIsMobile();
  const assetCol = isMobile ? ASSET_COL_MOBILE : ASSET_COL;
  const formCol = isMobile ? FORM_COL_MOBILE : FORM_COL;

  // Reminders-only: keep only rows (asset/form) that have something to action.
  const rows = useMemo(() => {
    return data.assets
      .map((asset) => {
        const forms = remindersOnly
          ? asset.forms.filter((f) =>
              data.days.some((d) => {
                const st = statusOf(f.cells[d], d, data.today);
                return st === 'missed' || st === 'exception';
              }),
            )
          : asset.forms;
        return { asset, forms };
      })
      .filter((r) => r.forms.length > 0);
  }, [data, remindersOnly]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card py-20 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <p className="mt-4 text-base font-semibold text-foreground">Nothing to action</p>
        <p className="mt-1 text-sm text-muted-foreground">
          No missed inspections or exceptions in this range.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {data.meta.truncated && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary-50 px-3 py-2 text-sm text-primary-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Showing the first {data.meta.assetCap} of {data.meta.assetCount} assets. Filter by team to narrow the list.
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border bg-card">
        <table className="w-max table-fixed border-separate border-spacing-0">
          <colgroup>
            <col style={{ width: assetCol }} />
            <col style={{ width: formCol }} />
            {data.days.map((d) => (
              <col key={d} style={{ width: s.col }} />
            ))}
          </colgroup>

          {/* Header */}
          <thead>
            <tr>
              <th
                className="sticky left-0 top-0 z-30 border-b border-r bg-card px-2.5 py-3 text-left sm:px-4"
                style={{ left: 0 }}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Truck className="h-4 w-4 text-muted-foreground" /> Assets
                </span>
              </th>
              <th
                className="sticky top-0 z-30 border-b border-r bg-card px-2.5 py-3 text-left sm:px-4"
                style={{ left: assetCol }}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" /> Forms
                </span>
              </th>
              {data.days.map((d, i) => {
                const isToday = i === todayIdx;
                const dt = parseISO(d);
                return (
                  <th
                    key={d}
                    className={cn(
                      'sticky top-0 z-20 border-b bg-card px-0.5 py-2 text-center align-bottom',
                      isToday && 'bg-primary-50',
                      isToday && 'border-x border-primary/40',
                    )}
                  >
                    {isToday && (
                      <span className="mb-1 block rounded-sm bg-primary px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                        Today
                      </span>
                    )}
                    <span
                      className={cn(
                        'block text-[11px] font-medium uppercase',
                        isToday ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {format(dt, 'EEEEE')}
                    </span>
                    <span
                      className={cn(
                        'block text-sm font-semibold tabular-nums',
                        isToday ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {format(dt, 'd')}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {rows.map(({ asset, forms }) =>
              forms.map((form, fi) => (
                <tr key={`${asset.assetId}:${form.formId}`} className="group">
                  {fi === 0 && (
                    <td
                      rowSpan={forms.length}
                      className="sticky left-0 z-10 border-b border-r bg-card px-2.5 align-top sm:px-4"
                      style={{ left: 0 }}
                    >
                      <div className={cn('font-semibold text-foreground', s.pad, s.text)}>
                        {asset.assetName}
                        {asset.assetNumber && (
                          <span className="ml-1 font-normal text-muted-foreground">
                            {asset.assetNumber}
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  <td
                    className="sticky z-10 border-b border-r bg-card px-2.5 sm:px-4"
                    style={{ left: assetCol }}
                  >
                    <div className={cn('truncate text-muted-foreground', s.pad, s.text)}>
                      {form.formTitle}
                    </div>
                  </td>
                  {data.days.map((d, i) => {
                    const isToday = i === todayIdx;
                    const cell = form.cells[d];
                    const st = statusOf(cell, d, data.today);
                    return (
                      <td
                        key={d}
                        className={cn(
                          'border-b px-1',
                          s.pad,
                          isToday && 'bg-primary-50/60 border-x border-primary/30',
                        )}
                      >
                        <button
                          type="button"
                          aria-label={`${asset.assetName} · ${form.formTitle} · ${format(parseISO(d), 'MMM d')} · ${STATUS_LABEL[st]}`}
                          onClick={(e) =>
                            onCellClick(e, {
                              assetId: asset.assetId,
                              assetName: asset.assetName,
                              formTitle: form.formTitle,
                              day: d,
                              status: st,
                              cell,
                            })
                          }
                          className={cn(
                            'flex w-full items-center justify-center rounded-md text-white transition-colors',
                            s.cell,
                            CELL_CLASS[st],
                          )}
                        >
                          {st === 'inspected' && <Check className="h-3.5 w-3.5" />}
                          {st === 'exception' && <X className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <LegendDot className="bg-emerald-500" label="Inspected" />
        <LegendDot className="bg-red-500" label="Exception" />
        <LegendDot className="bg-muted" label="Missed" />
        <LegendDot className="bg-muted ring-1 ring-inset ring-primary" label="Due today" />
        <LegendDot className="bg-muted/40" label="Upcoming" />
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-3.5 w-3.5 rounded', className)} />
      {label}
    </span>
  );
}

// ── Cell popup menu ────────────────────────────────────────────────────────────
function CellMenu({
  active,
  onViewInspection,
  onViewAsset,
}: {
  active: ActiveCell;
  onViewInspection: (a: ActiveCell) => void;
  onViewAsset: (a: ActiveCell) => void;
}) {
  const hasSubmission = !!active.cell;

  return (
    <div className="py-1.5">
      <div className="px-3 pb-1.5 pt-1">
        <p className={cn('text-sm font-semibold', STATUS_HEADER_CLASS[active.status])}>
          {STATUS_LABEL[active.status]}
        </p>
        <p className="text-xs text-muted-foreground">
          {active.formTitle} · {format(parseISO(active.day), 'EEE, MMM d')}
        </p>
        {active.cell && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {active.cell.inspectionNumber ? `${active.cell.inspectionNumber} · ` : ''}
            {active.cell.count} submission{active.cell.count > 1 ? 's' : ''}
            {active.cell.defectCount > 0 ? ` · ${active.cell.defectCount} defect${active.cell.defectCount > 1 ? 's' : ''}` : ''}
          </p>
        )}
      </div>
      <div className="my-1 h-px bg-border" />
      {hasSubmission && (
        <MenuItem icon={FileText} label="View inspection" onClick={() => onViewInspection(active)} />
      )}
      <MenuItem icon={ArrowUpRight} label="View asset" onClick={() => onViewAsset(active)} />
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof FileText;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      {label}
    </button>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────
function DateRangeButton({
  range,
  onChange,
}: {
  range: DateRange | undefined;
  onChange: (r: DateRange | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const label =
    range?.from && range?.to
      ? `${format(range.from, 'MMM d, yyyy')} - ${format(range.to, 'MMM d, yyyy')}`
      : range?.from
        ? format(range.from, 'MMM d, yyyy')
        : 'Select dates';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          {label}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar mode="range" selected={range} onSelect={onChange} numberOfMonths={2} />
      </PopoverContent>
    </Popover>
  );
}

function MultiSelectButton({
  icon: Icon,
  label,
  allLabel,
  options,
  selected,
  onChange,
}: {
  icon: typeof ClipboardList;
  label: string;
  allLabel: string;
  options: Option[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="gap-2">
          <Icon className="h-4 w-4" />
          {label}
          {selected.length > 0 && (
            <span className="rounded-full bg-primary-foreground/20 px-1.5 text-xs font-semibold tabular-nums">
              {selected.length}
            </span>
          )}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="border-b p-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8" />
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">
            {selected.length === 0 ? allLabel : `${selected.length} selected`}
          </span>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="font-semibold text-primary hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">No options</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <Checkbox checked={selected.includes(o.value)} className="pointer-events-none" />
                <span className="truncate">{o.label}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RowSizeToggle({ value, onChange }: { value: RowSize; onChange: (v: RowSize) => void }) {
  const opts: { value: RowSize; label: string }[] = [
    { value: 'large', label: 'Large' },
    { value: 'medium', label: 'Medium' },
    { value: 'small', label: 'Small' },
  ];
  return (
    <div className="inline-flex rounded-md border p-0.5">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded px-3 py-1 text-sm font-medium transition-colors',
            value === o.value
              ? 'bg-primary-50 text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  );
}

// ── States ─────────────────────────────────────────────────────────────────────
function GridSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-40" />
        <div className="ml-auto flex gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-8 w-10" />
          ))}
        </div>
      </div>
      {[0, 1, 2, 3, 4, 5].map((r) => (
        <div key={r} className="flex items-center gap-4 border-b px-4 py-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-40" />
          <div className="ml-auto flex gap-2">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-8 w-10" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasForms }: { hasForms: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ClipboardList className="h-7 w-7" />
      </span>
      <p className="mt-4 text-base font-semibold text-foreground">No inspection activity</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {hasForms
          ? 'No assets have submitted inspections in this window (or none match the selected forms/teams). Widen the date range or clear the filters above.'
          : 'Create an inspection form to start tracking compliance across your fleet.'}
      </p>
    </div>
  );
}
