/**
 * Reusable, dependency-free chart primitives (pure SVG).
 *
 * Built to the project's data-viz rules: thin marks, recessive grid/axes, a
 * legend for every multi-series chart, selective direct labels, and a hover
 * tooltip on each mark. Colours come from CSS custom properties so light/dark
 * swap in one place — status roles use the reserved `--status-*` tokens (always
 * paired with a label), single-series charts use the brand hue.
 *
 * Shared across the dashboard and any future analytics view — presentational
 * only, no data fetching.
 */
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

// ─── Colour roles ────────────────────────────────────────────────────────────

/** Reserved status hues (themed via globals.css). Always shown with a label. */
export const STATUS_COLORS = {
  good: 'var(--status-good)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-critical)',
  neutral: 'var(--status-neutral)',
} as const;

/** Brand hue for single-series (magnitude / trend) charts. */
export const BRAND_COLOR = 'var(--primary)';

// ─── Formatting helpers ──────────────────────────────────────────────────────

/** Compact integer/decimal formatter (1.2k, 3.4M). */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(n * 100) / 100}`;
}

export type ValueFormatter = (n: number) => string;

// ─── ChartCard ───────────────────────────────────────────────────────────────

interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Optional element rendered on the right of the header (e.g. a total). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Titled card wrapper matching the app's StatCard surface styling. */
export function ChartCard({ title, subtitle, action, className, children }: ChartCardProps) {
  return (
    <div className={cn('rounded-sm border bg-card p-5 shadow-sm', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ─── Legend ──────────────────────────────────────────────────────────────────

export interface LegendItem {
  label: string;
  color: string;
  value?: React.ReactNode;
}

/** Swatch + label rows. Text stays in ink tokens; colour is carried by the chip.
 *  Labels wrap instead of clipping — a name never gets cut mid-word to fit a
 *  narrow card; the row just grows to a second line when it must. */
export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex min-w-0 flex-col gap-2', className)}>
      {items.map((it, i) => (
        <li key={i} className="flex items-start justify-between gap-3 text-xs">
          <span className="flex min-w-0 items-start gap-2">
            <span
              className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: it.color }}
              aria-hidden
            />
            <span className="text-muted-foreground leading-snug">{it.label}</span>
          </span>
          {it.value != null && (
            <span className="shrink-0 font-medium text-foreground tabular-nums">{it.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
      style={{ left: x, top: y - 10 }}
    >
      {children}
    </div>
  );
}

function useHover<T>() {
  const [hover, setHover] = React.useState<{ x: number; y: number; datum: T } | null>(null);
  return { hover, setHover };
}

/** Track a container's pixel width so the SVG can be drawn 1:1 (no aspect-ratio
 *  distortion of text or circular markers on fluid-width cards). */
function useElementWidth(fallback = 320): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(fallback);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// ─── DonutChart ──────────────────────────────────────────────────────────────

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutDatum[];
  /** Diameter in px. */
  size?: number;
  /** Ring thickness in px. */
  thickness?: number;
  centerLabel?: string;
  /** Overrides the auto-computed centre total. */
  centerValue?: React.ReactNode;
  valueFormat?: ValueFormatter;
  className?: string;
}

/** Donut with 2px gaps between segments, rounded ends, centre total, and a
 *  per-segment hover tooltip (label · value · share). */
export function DonutChart({
  data,
  size = 168,
  thickness = 22,
  centerLabel,
  centerValue,
  valueFormat = formatCompact,
  className,
}: DonutChartProps) {
  const { hover, setHover } = useHover<DonutDatum>();
  const positive = data.filter((d) => d.value > 0);
  const total = positive.reduce((s, d) => s + d.value, 0);

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const GAP = positive.length > 1 ? 3 : 0; // px gap between segments

  // Pre-compute each segment's dash geometry.
  let acc = 0;
  const segments = positive.map((d) => {
    const frac = d.value / total;
    const len = Math.max(frac * C - GAP, 0.001);
    const offset = acc + GAP / 2;
    acc += frac * C;
    return { d, len, offset, frac };
  });

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={centerLabel ?? 'Donut chart'}
      >
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" className="stroke-muted" strokeWidth={thickness} />
        {total > 0 &&
          segments.map((s, i) => {
            const dimmed = hover != null && hover.datum !== s.d;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.d.color}
                strokeWidth={thickness}
                strokeLinecap={GAP > 0 ? 'round' : 'butt'}
                strokeDasharray={`${s.len} ${C - s.len}`}
                strokeDashoffset={-s.offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{
                  transition: 'opacity 150ms',
                  opacity: dimmed ? 0.35 : 1,
                  cursor: 'pointer',
                }}
                onMouseMove={(e) => {
                  const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                  setHover({ x: e.clientX - box.left, y: e.clientY - box.top, datum: s.d });
                }}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        {/* Centre label */}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-foreground" style={{ fontSize: 22, fontWeight: 600 }}>
          {centerValue ?? valueFormat(total)}
        </text>
        {centerLabel && (
          <text x={cx} y={cy + 14} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11 }}>
            {centerLabel}
          </text>
        )}
      </svg>
      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          <span className="font-medium">{hover.datum.label}</span>{' '}
          <span className="text-muted-foreground">
            {valueFormat(hover.datum.value)} · {total > 0 ? Math.round((hover.datum.value / total) * 100) : 0}%
          </span>
        </Tooltip>
      )}
    </div>
  );
}

// ─── BarChart (vertical) ─────────────────────────────────────────────────────

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  valueFormat?: ValueFormatter;
  className?: string;
}

/** Vertical bars with rounded tops on the baseline, recessive gridlines, direct
 *  value labels, and a per-bar hover tooltip. Drawn at the container's measured
 *  pixel width so text/marks never distort. */
export function BarChart({ data, height = 200, valueFormat = formatCompact, className }: BarChartProps) {
  const { hover, setHover } = useHover<BarDatum>();
  const [ref, W] = useElementWidth();
  const H = height;
  const padX = 12;
  const padTop = 18; // room for value labels
  const padBottom = 26; // room for x labels
  const plotH = H - padTop - padBottom;
  const plotW = W - padX * 2;
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.min(48, slot * 0.56);
  const gridLines = 4;

  const y = (v: number) => padTop + plotH - (v / max) * plotH;

  const roundedTop = (x: number, yTop: number, w: number, h: number, r: number) => {
    const rr = Math.min(r, w / 2, h);
    return `M ${x} ${yTop + h} L ${x} ${yTop + rr} Q ${x} ${yTop} ${x + rr} ${yTop} L ${x + w - rr} ${yTop} Q ${x + w} ${yTop} ${x + w} ${yTop + rr} L ${x + w} ${yTop + h} Z`;
  };

  return (
    <div ref={ref} className={cn('relative w-full', className)}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart">
        {/* Gridlines */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const gy = padTop + (plotH / gridLines) * i;
          return <line key={i} x1={padX} y1={gy} x2={W - padX} y2={gy} className="stroke-border" strokeWidth={1} opacity={i === gridLines ? 0.9 : 0.4} />;
        })}
        {data.map((d, i) => {
          const bx = padX + slot * i + (slot - barW) / 2;
          const barTop = y(d.value);
          const h = padTop + plotH - barTop;
          const color = d.color ?? BRAND_COLOR;
          const dimmed = hover != null && hover.datum !== d;
          return (
            <g key={i}>
              <path
                d={roundedTop(bx, barTop, barW, Math.max(h, 0.5), 4)}
                fill={color}
                style={{ transition: 'opacity 150ms', opacity: dimmed ? 0.4 : 1, cursor: 'pointer' }}
                onMouseMove={(e) => {
                  const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                  setHover({ x: e.clientX - box.left, y: e.clientY - box.top, datum: d });
                }}
                onMouseLeave={() => setHover(null)}
              />
              {/* Direct value label */}
              <text
                x={bx + barW / 2}
                y={barTop - 6}
                textAnchor="middle"
                className="fill-foreground"
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                {valueFormat(d.value)}
              </text>
              {/* X label */}
              <text
                x={bx + barW / 2}
                y={H - 9}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 11 }}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          <span className="font-medium">{hover.datum.label}</span>{' '}
          <span className="text-muted-foreground">{valueFormat(hover.datum.value)}</span>
        </Tooltip>
      )}
    </div>
  );
}

// ─── TrendAreaChart (single series, time) ────────────────────────────────────

export interface TrendPoint {
  label: string;
  value: number;
}

interface TrendAreaChartProps {
  data: TrendPoint[];
  height?: number;
  color?: string;
  valueFormat?: ValueFormatter;
  className?: string;
}

/** Single-series area + line with a gradient fill, markers, recessive Y grid,
 *  and a hover crosshair + tooltip that snaps to the nearest point. */
export function TrendAreaChart({
  data,
  height = 220,
  color = BRAND_COLOR,
  valueFormat = formatCompact,
  className,
}: TrendAreaChartProps) {
  // `px` is the hovered point's x in wrapper pixels (svg is width-scaled).
  const [active, setActive] = React.useState<{ idx: number; px: number } | null>(null);
  const gradId = React.useId();

  const [ref, W] = useElementWidth(640);
  const H = height;
  const padL = 44;
  const padR = 14;
  const padTop = 14;
  const padBottom = 26;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;

  const max = Math.max(1, ...data.map((d) => d.value));
  const niceMax = niceCeil(max);
  const n = data.length;
  const x = (i: number) => (n <= 1 ? padL + plotW / 2 : padL + (plotW / (n - 1)) * i);
  const y = (v: number) => padTop + plotH - (v / niceMax) * plotH;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ');
  const areaPath =
    n > 0
      ? `${linePath} L ${x(n - 1)} ${padTop + plotH} L ${x(0)} ${padTop + plotH} Z`
      : '';
  const gridLines = 4;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width) return;
    // svg is drawn 1:1 (viewBox width == px width), so px maps straight to units.
    const localX = e.clientX - box.left;
    let nearest = 0;
    let best = Infinity;
    data.forEach((_, i) => {
      const d = Math.abs(x(i) - localX);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setActive({ idx: nearest, px: x(nearest) });
  };

  const idx = active?.idx ?? null;
  // Vertical axis is 1:1 (rendered height == viewBox height), so y() is already px.
  const tipY = idx != null ? y(data[idx].value) : 0;

  return (
    <div ref={ref} className={cn('relative w-full', className)} onMouseLeave={() => setActive(null)}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Y gridlines + labels */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const gy = padTop + (plotH / gridLines) * i;
          const val = niceMax - (niceMax / gridLines) * i;
          return (
            <g key={i}>
              <line x1={padL} y1={gy} x2={W - padR} y2={gy} className="stroke-border" strokeWidth={1} opacity={i === gridLines ? 0.9 : 0.4} />
              <text x={padL - 8} y={gy + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
                {valueFormat(val)}
              </text>
            </g>
          );
        })}

        {n > 0 && <path d={areaPath} fill={`url(#${gradId})`} />}
        {n > 0 && <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}

        {/* Markers */}
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.value)} r={idx === i ? 5 : 3.5} fill={color} className="stroke-card" strokeWidth={2} />
        ))}

        {/* Crosshair */}
        {idx != null && (
          <line x1={x(idx)} y1={padTop} x2={x(idx)} y2={padTop + plotH} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
        )}

        {/* X labels */}
        {data.map((d, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
            {d.label}
          </text>
        ))}
      </svg>
      {active != null && data[active.idx] && (
        <Tooltip x={active.px} y={tipY}>
          <span className="font-medium">{data[active.idx].label}</span>{' '}
          <span className="text-muted-foreground">{valueFormat(data[active.idx].value)}</span>
        </Tooltip>
      )}
    </div>
  );
}

/** Round a max up to a friendly axis bound (10, 25, 50, 100, 250, …). */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const frac = v / pow;
  const step = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  return step * pow;
}
