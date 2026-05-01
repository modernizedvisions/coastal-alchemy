import { useRef, useState } from 'react';
import { formatBucketRangeCompact, formatBucketRangeLong, formatLineValueTooltip } from './timeBucketFormatting';
import type { NameValueDatum, TimeSeriesPoint } from './types';

function fmtInt(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

const toLinePoints = (
  values: number[],
  bounds: { x: number; y: number; width: number; height: number },
  yMax: number
): string => {
  if (!values.length) return '';
  const safeMax = Math.max(1, yMax);
  return values
    .map((value, index) => {
      const x =
        values.length === 1
          ? bounds.x + bounds.width / 2
          : bounds.x + (index / Math.max(values.length - 1, 1)) * bounds.width;
      const y = bounds.y + bounds.height - (Math.max(0, value) / safeMax) * bounds.height;
      return `${x},${y}`;
    })
    .join(' ');
};

const toNiceMax = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  if (normalized <= 1) return 1 * magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
};

const shouldRenderXAxisTick = (index: number, count: number): boolean => {
  if (count <= 8) return true;
  if (index === 0 || index === count - 1) return true;
  const step = Math.ceil(count / 6);
  return index % step === 0;
};

const formatTick = (value: number): string => {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return fmtInt(value);
};

const linePointX = (index: number, count: number, bounds: { x: number; width: number }): number =>
  count === 1 ? bounds.x + bounds.width / 2 : bounds.x + (index / Math.max(count - 1, 1)) * bounds.width;

const linePointY = (value: number, yMax: number, bounds: { y: number; height: number }): number =>
  bounds.y + bounds.height - (Math.max(0, value) / Math.max(1, yMax)) * bounds.height;

export const SIMPLE_LINE_SERIES_STYLES = {
  primary: { color: '#2F4F4F', strokeWidth: 2, dashArray: undefined as string | undefined },
  secondary: { color: '#9FBFBB', strokeWidth: 1.6, dashArray: '2.2 1.2' },
  tertiary: { color: '#CBBFAF', strokeWidth: 1.6, dashArray: '1.4 1.2' },
} as const;

export function SimpleLineChart({
  points,
  xAxisLabel = 'Time',
  yAxisLabel = 'Count',
  valueLabel = 'value',
  seriesLabels,
  interactiveBucketHover = false,
}: {
  points: TimeSeriesPoint[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  valueLabel?: string;
  seriesLabels?: {
    primary: string;
    secondary?: string;
    tertiary?: string;
  };
  interactiveBucketHover?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const primary = points.map((point) => point.value);
  const secondary = points.some((point) => typeof point.secondaryValue === 'number')
    ? points.map((point) => point.secondaryValue || 0)
    : [];
  const tertiary = points.some((point) => typeof point.tertiaryValue === 'number')
    ? points.map((point) => point.tertiaryValue || 0)
    : [];
  const has7DayRow = points.length === 7;
  const maxValue = Math.max(1, ...primary, ...secondary, ...tertiary);
  const yMax = toNiceMax(maxValue);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    value: Math.round(yMax * ratio),
  }));
  const chartBounds = {
    x: 12,
    y: 5,
    width: 84,
    height: 34,
  };
  const xPositions = points.map((_, index) => linePointX(index, points.length, chartBounds));
  const interactiveHover = interactiveBucketHover && points.length > 0;
  const activePoint = interactiveHover && activeIndex !== null ? points[activeIndex] : null;
  const activeX = interactiveHover && activeIndex !== null ? xPositions[activeIndex] : null;
  const activeBand =
    interactiveHover && activeIndex !== null
      ? {
          left: activeIndex === 0 ? chartBounds.x : (xPositions[activeIndex - 1] + xPositions[activeIndex]) / 2,
          right:
            activeIndex === points.length - 1
              ? chartBounds.x + chartBounds.width
              : (xPositions[activeIndex] + xPositions[activeIndex + 1]) / 2,
        }
      : null;

  const tooltipHeading = activePoint ? formatBucketRangeLong(activePoint) : '';
  const tooltipPrimaryValue = activePoint
    ? seriesLabels
      ? `${seriesLabels.primary}: ${fmtInt(activePoint.value)}`
      : `${fmtInt(activePoint.value)} ${Math.abs(activePoint.value) === 1 ? valueLabel : `${valueLabel}s`}`
    : '';
  const tooltipSecondaryValue =
    activePoint && seriesLabels?.secondary && secondary.length ? `${seriesLabels.secondary}: ${fmtInt(activePoint.secondaryValue || 0)}` : null;
  const tooltipTertiaryValue =
    activePoint && seriesLabels?.tertiary && tertiary.length ? `${seriesLabels.tertiary}: ${fmtInt(activePoint.tertiaryValue || 0)}` : null;

  const setActiveFromClientX = (clientX: number) => {
    if (!interactiveHover || !svgRef.current || !points.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width) return;
    const viewX = ((clientX - rect.left) / rect.width) * 100;
    const clampedX = Math.min(chartBounds.x + chartBounds.width, Math.max(chartBounds.x, viewX));
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    xPositions.forEach((x, index) => {
      const distance = Math.abs(x - clampedX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActiveIndex(nearestIndex);
  };

  const tooltipForPoint = (point: TimeSeriesPoint): string => {
    if (!seriesLabels) {
      return formatLineValueTooltip(point, valueLabel);
    }
    const lines = [formatBucketRangeLong(point), `${seriesLabels.primary}: ${fmtInt(point.value)}`];
    if (seriesLabels.secondary && secondary.length) {
      lines.push(`${seriesLabels.secondary}: ${fmtInt(point.secondaryValue || 0)}`);
    }
    if (seriesLabels.tertiary && tertiary.length) {
      lines.push(`${seriesLabels.tertiary}: ${fmtInt(point.tertiaryValue || 0)}`);
    }
    return lines.join('\n');
  };

  return (
    <div className="space-y-3">
      <div className="relative rounded-shell border border-driftwood/50 bg-white/70 p-3 md:p-4">
        {interactiveHover && activePoint && activeX !== null ? (
          <div
            className="pointer-events-none absolute z-20 rounded-shell border border-driftwood/50 bg-white/95 px-3 py-2 shadow-sm"
            style={{
              left: `${Math.min(94, Math.max(6, activeX))}%`,
              top: '6px',
              transform: 'translateX(-50%)',
            }}
          >
            <p className="text-[10px] uppercase tracking-[0.14em] text-deep-ocean/70">{tooltipHeading}</p>
            <p className="text-sm font-semibold text-deep-ocean">{tooltipPrimaryValue}</p>
            {tooltipSecondaryValue ? <p className="text-xs text-charcoal/75">{tooltipSecondaryValue}</p> : null}
            {tooltipTertiaryValue ? <p className="text-xs text-charcoal/75">{tooltipTertiaryValue}</p> : null}
          </div>
        ) : null}

        <svg
          ref={svgRef}
          viewBox="0 0 100 48"
          className="w-full h-44 md:h-48"
          role="img"
          aria-label="trend chart"
          onMouseMove={(event) => setActiveFromClientX(event.clientX)}
          onMouseLeave={() => {
            if (interactiveHover) setActiveIndex(null);
          }}
        >
          {yTicks.map((tick) => {
            const y = chartBounds.y + chartBounds.height - chartBounds.height * tick.ratio;
            return (
              <g key={`y-tick-${tick.ratio}`}>
                <line x1={chartBounds.x} y1={y} x2={chartBounds.x + chartBounds.width} y2={y} stroke="#D5C6AE" strokeWidth="0.35" />
                <text x={chartBounds.x - 1.5} y={y + 1.1} textAnchor="end" fontSize="2.6" fill="#4A5A58">
                  {formatTick(tick.value)}
                </text>
              </g>
            );
          })}
          <line
            x1={chartBounds.x}
            y1={chartBounds.y + chartBounds.height}
            x2={chartBounds.x + chartBounds.width}
            y2={chartBounds.y + chartBounds.height}
            stroke="#8A7762"
            strokeWidth="0.45"
          />
          <line x1={chartBounds.x} y1={chartBounds.y} x2={chartBounds.x} y2={chartBounds.y + chartBounds.height} stroke="#8A7762" strokeWidth="0.45" />

          {interactiveHover && activeBand && activeX !== null ? (
            <>
              <rect
                x={activeBand.left}
                y={chartBounds.y}
                width={Math.max(0.6, activeBand.right - activeBand.left)}
                height={chartBounds.height}
                fill="#2F4F4F"
                opacity="0.06"
              />
              <line
                x1={activeX}
                y1={chartBounds.y}
                x2={activeX}
                y2={chartBounds.y + chartBounds.height}
                stroke="#2F4F4F"
                strokeOpacity="0.35"
                strokeDasharray="1.4 1.1"
                strokeWidth="0.45"
              />
            </>
          ) : null}

          {!interactiveHover
            ? points.map((point, index) => {
                const x = xPositions[index];
                const leftX = index === 0 ? chartBounds.x : (xPositions[index - 1] + x) / 2;
                const rightX = index === points.length - 1 ? chartBounds.x + chartBounds.width : (x + xPositions[index + 1]) / 2;
                const width = Math.max(0.6, rightX - leftX);
                return (
                  <rect
                    key={`hover-band-${point.label}-${index}`}
                    x={leftX}
                    y={chartBounds.y}
                    width={width}
                    height={chartBounds.height}
                    fill="transparent"
                  >
                    <title>{tooltipForPoint(point)}</title>
                  </rect>
                );
              })
            : null}

          {interactiveHover ? (
            <rect
              x={chartBounds.x}
              y={chartBounds.y}
              width={chartBounds.width}
              height={chartBounds.height}
              fill="transparent"
            />
          ) : null}

          <polyline
            fill="none"
            stroke={SIMPLE_LINE_SERIES_STYLES.primary.color}
            strokeWidth={SIMPLE_LINE_SERIES_STYLES.primary.strokeWidth}
            points={toLinePoints(primary, chartBounds, yMax)}
          />
          {secondary.length ? (
            <polyline
              fill="none"
              stroke={SIMPLE_LINE_SERIES_STYLES.secondary.color}
              strokeWidth={SIMPLE_LINE_SERIES_STYLES.secondary.strokeWidth}
              strokeDasharray={SIMPLE_LINE_SERIES_STYLES.secondary.dashArray}
              points={toLinePoints(secondary, chartBounds, yMax)}
            />
          ) : null}
          {tertiary.length ? (
            <polyline
              fill="none"
              stroke={SIMPLE_LINE_SERIES_STYLES.tertiary.color}
              strokeWidth={SIMPLE_LINE_SERIES_STYLES.tertiary.strokeWidth}
              strokeDasharray={SIMPLE_LINE_SERIES_STYLES.tertiary.dashArray}
              points={toLinePoints(tertiary, chartBounds, yMax)}
            />
          ) : null}

          {points.map((point, index) => (
            <circle
              key={`primary-point-${point.label}-${index}`}
              cx={xPositions[index]}
              cy={linePointY(point.value, yMax, chartBounds)}
              r={interactiveHover && activeIndex === index ? 2.3 : 1.2}
              fill={SIMPLE_LINE_SERIES_STYLES.primary.color}
              stroke="#fff"
              strokeWidth={interactiveHover && activeIndex === index ? '0.75' : '0.35'}
            >
              {!interactiveHover ? <title>{tooltipForPoint(point)}</title> : null}
            </circle>
          ))}

          {interactiveHover && activePoint && activeX !== null && secondary.length ? (
            <circle
              cx={activeX}
              cy={linePointY(activePoint.secondaryValue || 0, yMax, chartBounds)}
              r="1.7"
              fill={SIMPLE_LINE_SERIES_STYLES.secondary.color}
              stroke="#fff"
              strokeWidth="0.55"
            />
          ) : null}
          {interactiveHover && activePoint && activeX !== null && tertiary.length ? (
            <circle
              cx={activeX}
              cy={linePointY(activePoint.tertiaryValue || 0, yMax, chartBounds)}
              r="1.7"
              fill={SIMPLE_LINE_SERIES_STYLES.tertiary.color}
              stroke="#fff"
              strokeWidth="0.55"
            />
          ) : null}

          {points.map((point, index) => {
            if (!shouldRenderXAxisTick(index, points.length)) return null;
            const x = xPositions[index];
            const y = chartBounds.y + chartBounds.height + 3.6;
            return (
              <text key={`${point.label}-${index}`} x={x} y={y} textAnchor="middle" fontSize="2.55" fill="#4A5A58">
                {point.label}
              </text>
            );
          })}
          <text x={chartBounds.x + chartBounds.width / 2} y={47} textAnchor="middle" fontSize="2.8" fill="#304B4B">
            {xAxisLabel}
          </text>
          <text
            x={2.2}
            y={chartBounds.y + chartBounds.height / 2}
            textAnchor="middle"
            fontSize="2.8"
            fill="#304B4B"
            transform={`rotate(-90 2.2 ${chartBounds.y + chartBounds.height / 2})`}
          >
            {yAxisLabel}
          </text>
        </svg>
      </div>
      <div className="overflow-x-auto">
        <div className={has7DayRow ? 'grid grid-cols-7 gap-2 min-w-[700px] md:min-w-0' : 'grid grid-cols-2 md:grid-cols-4 gap-2'}>
          {points.map((point, index) => (
            <div
              key={`${point.label}-${index}`}
              className="rounded-shell border border-driftwood/40 bg-linen/70 px-2.5 py-2"
              title={formatBucketRangeCompact(point)}
            >
              <p className="text-[10px] uppercase tracking-[0.14em] text-deep-ocean/70">{point.label}</p>
              <p className="text-sm font-semibold text-deep-ocean">{fmtInt(point.value)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HorizontalBars({
  data,
  valueFormatter = fmtInt,
}: {
  data: Array<{ label: string; value: number }>;
  valueFormatter?: (value: number) => string;
}) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="space-y-3">
      {data.map((item) => {
        const widthPct = (item.value / max) * 100;
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-deep-ocean/75">
              <span>{item.label}</span>
              <span className="tracking-[0.08em]">{valueFormatter(item.value)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-driftwood/30 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sea-glass to-deep-ocean"
                style={{ width: `${Math.max(6, widthPct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const DONUT_COLORS = ['#2F4F4F', '#9FBFBB', '#D9C7A1', '#CBBFAF', '#6D8A8A', '#B3A18A'];

function toSliceValue(item: NameValueDatum): number {
  const raw = typeof item.count === 'number' ? item.count : item.value;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, raw);
}

export function DonutWithLegend({ data }: { data: NameValueDatum[] }) {
  const positiveData = data.filter((item) => toSliceValue(item) > 0);
  const total = positiveData.reduce((sum, item) => sum + toSliceValue(item), 0);
  if (!positiveData.length || total <= 0) {
    return (
      <div className="rounded-shell border border-driftwood/45 bg-linen/70 px-4 py-6 text-center">
        <p className="text-sm text-charcoal/80">No source data in this timeframe.</p>
      </div>
    );
  }

  const radius = 62;
  const strokeWidth = 32;
  const size = 168;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  let dashOffsetAccumulator = 0;

  const slices = positiveData.map((item, index) => {
    const rawValue = toSliceValue(item);
    const share = rawValue / total;
    const segmentLength = share * circumference;
    const slice = {
      item,
      rawValue,
      share,
      color: DONUT_COLORS[index % DONUT_COLORS.length],
      dashArray: `${segmentLength} ${Math.max(circumference - segmentLength, 0.0001)}`,
      dashOffset: -dashOffsetAccumulator,
      tooltip: `${item.name} - ${fmtInt(rawValue)} visits - ${pct(share * 100)}`,
    };
    dashOffsetAccumulator += segmentLength;
    return slice;
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-[190px,1fr] gap-4 items-center">
      <div className="flex items-center justify-center">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44" role="img" aria-label="donut chart">
          <circle cx={center} cy={center} r={radius} fill="none" stroke="#E9DECD" strokeWidth={strokeWidth} />
          {slices.map((slice, index) => (
            <circle
              key={`${slice.item.name}-${index}`}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={slice.dashArray}
              strokeDashoffset={slice.dashOffset}
              transform={`rotate(-90 ${center} ${center})`}
            >
              <title>{slice.tooltip}</title>
            </circle>
          ))}
          <circle cx={center} cy={center} r={radius - strokeWidth / 2} fill="#FFFFFFF2" />
        </svg>
      </div>
      <div className="space-y-2">
        {slices.map((slice, index) => (
          <div key={`${slice.item.name}-legend-${index}`} className="flex items-center justify-between rounded-shell border border-driftwood/40 bg-linen/80 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
              <span className="text-xs uppercase tracking-[0.14em] text-deep-ocean/80">{slice.item.name}</span>
            </div>
            <span className="text-sm font-semibold text-deep-ocean">{pct(slice.share * 100)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FunnelVisual({ steps }: { steps: Array<{ label: string; count: number }> }) {
  const max = Math.max(...steps.map((step) => step.count), 1);
  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const widthPct = (step.count / max) * 100;
        return (
          <div key={step.label} className="rounded-shell border border-driftwood/45 bg-white/80 px-3 py-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.2em] text-deep-ocean/70">
                {index + 1}. {step.label}
              </p>
              <p className="text-sm font-semibold text-deep-ocean">{fmtInt(step.count)}</p>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-driftwood/30 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-deep-ocean to-sea-glass" style={{ width: `${Math.max(8, widthPct)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PercentProgressList({ rates }: { rates: Array<{ label: string; value: number }> }) {
  return (
    <div className="space-y-3">
      {rates.map((rate) => (
        <div key={rate.label} className="rounded-shell border border-driftwood/40 bg-linen/75 px-3 py-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.18em] text-deep-ocean/70">{rate.label}</p>
            <p className="text-sm font-semibold text-deep-ocean">{pct(rate.value)}</p>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-driftwood/30 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-sea-glass to-deep-ocean" style={{ width: `${Math.max(4, Math.min(rate.value, 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
