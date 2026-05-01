import type { AnalyticsDateRange, AnalyticsTimeframe, AnalyticsTimeframeRange, TimeframeMeta } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const ANALYTICS_TIMEFRAMES: TimeframeMeta[] = [
  { key: 'last7Days', label: 'Last 7 Days', compareLabel: 'previous 7 days', multiplier: 1, hasComparison: true },
  { key: 'last30Days', label: 'Last 30 Days', compareLabel: 'previous 30 days', multiplier: 1, hasComparison: true },
  { key: 'last90Days', label: 'Last 90 Days', compareLabel: 'previous 90 days', multiplier: 1, hasComparison: true },
  { key: 'yearToDate', label: 'Year to Date', compareLabel: 'previous equivalent range', multiplier: 1, hasComparison: true },
  { key: 'last12Months', label: 'Last 12 Months', compareLabel: 'previous 12 months', multiplier: 1, hasComparison: true },
  { key: 'lifetime', label: 'Lifetime', compareLabel: '', multiplier: 1, hasComparison: false },
];

const TIMEFRAME_MAP = new Map<AnalyticsTimeframe, TimeframeMeta>(ANALYTICS_TIMEFRAMES.map((item) => [item.key, item]));

const toUtcMidnight = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0));

const addDays = (value: Date, days: number): Date => new Date(value.getTime() + days * DAY_MS);

const toDateString = (value: Date): string => {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const diffDaysInclusive = (startDate: string, endDate: string): number => {
  const start = toUtcMidnight(new Date(`${startDate}T00:00:00.000Z`));
  const end = toUtcMidnight(new Date(`${endDate}T00:00:00.000Z`));
  const diff = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  return diff + 1;
};

const buildPreviousRange = (current: AnalyticsDateRange): AnalyticsDateRange => {
  const periodDays = diffDaysInclusive(current.startDate, current.endDate);
  const currentStart = toUtcMidnight(new Date(`${current.startDate}T00:00:00.000Z`));
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -(periodDays - 1));
  return {
    startDate: toDateString(previousStart),
    endDate: toDateString(previousEnd),
  };
};

const buildCurrentRange = (timeframe: AnalyticsTimeframe, now: Date): AnalyticsDateRange => {
  const today = toUtcMidnight(now);
  switch (timeframe) {
    case 'last7Days':
      return { startDate: toDateString(addDays(today, -6)), endDate: toDateString(today) };
    case 'last30Days':
      return { startDate: toDateString(addDays(today, -29)), endDate: toDateString(today) };
    case 'last90Days':
      return { startDate: toDateString(addDays(today, -89)), endDate: toDateString(today) };
    case 'yearToDate':
      return {
        startDate: toDateString(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))),
        endDate: toDateString(today),
      };
    case 'last12Months':
      return { startDate: toDateString(addDays(today, -364)), endDate: toDateString(today) };
    case 'lifetime':
      return { startDate: '2000-01-01', endDate: toDateString(today) };
    default:
      return { startDate: toDateString(addDays(today, -29)), endDate: toDateString(today) };
  }
};

export const parseAnalyticsTimeframe = (raw: string | null | undefined): AnalyticsTimeframe => {
  if (!raw) return 'last30Days';
  if (TIMEFRAME_MAP.has(raw as AnalyticsTimeframe)) {
    return raw as AnalyticsTimeframe;
  }
  return 'last30Days';
};

export const buildTimeframeRange = (timeframe: AnalyticsTimeframe, now = new Date()): AnalyticsTimeframeRange => {
  const meta = TIMEFRAME_MAP.get(timeframe) || TIMEFRAME_MAP.get('last30Days')!;
  const current = buildCurrentRange(meta.key, now);
  const previous = meta.key === 'lifetime' ? null : buildPreviousRange(current);
  return {
    timeframe: meta,
    current,
    previous,
  };
};
