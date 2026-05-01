import type { TimeframeMeta } from './types';

export const ANALYTICS_TIMEFRAMES: TimeframeMeta[] = [
  { key: 'last7Days', label: 'Last 7 Days', compareLabel: 'previous 7 days', multiplier: 0.34 },
  { key: 'last30Days', label: 'Last 30 Days', compareLabel: 'previous 30 days', multiplier: 1 },
  { key: 'last90Days', label: 'Last 90 Days', compareLabel: 'previous 90 days', multiplier: 2.85 },
  { key: 'yearToDate', label: 'Year to Date', compareLabel: 'previous equivalent range', multiplier: 7.8 },
  { key: 'last12Months', label: 'Last 12 Months', compareLabel: 'previous 12 months', multiplier: 11.4 },
  { key: 'lifetime', label: 'Lifetime', compareLabel: 'previous equivalent period', multiplier: 49.5, hasComparison: false },
];
