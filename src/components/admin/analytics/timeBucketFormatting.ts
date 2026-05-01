import type { TimeSeriesPoint } from './types';

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function fmtDateLong(value: Date): string {
  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function fmtDateCompact(value: Date): string {
  return value.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

function fmtHour(hour: number, minute: 0 | 59): string {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const date = new Date(Date.UTC(2000, 0, 1, normalizedHour, minute, 0, 0));
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

export function formatBucketRangeLong(point: Pick<TimeSeriesPoint, 'label' | 'rangeStart' | 'rangeEnd' | 'hourStart' | 'hourEnd'>): string {
  if (!point.rangeStart || !point.rangeEnd) return point.label;
  const start = parseIsoDate(point.rangeStart);
  const end = parseIsoDate(point.rangeEnd);
  if (!isValidDate(start) || !isValidDate(end)) return point.label;

  if (typeof point.hourStart === 'number' && typeof point.hourEnd === 'number') {
    const timeRange = `${fmtHour(point.hourStart, 0)} to ${fmtHour(point.hourEnd, 59)}`;
    if (point.rangeStart === point.rangeEnd) {
      return `${fmtDateLong(start)} ${timeRange}`;
    }
    return `${fmtDateLong(start)} ${fmtHour(point.hourStart, 0)} to ${fmtDateLong(end)} ${fmtHour(point.hourEnd, 59)}`;
  }

  if (point.rangeStart === point.rangeEnd) return fmtDateLong(start);
  return `${fmtDateLong(start)} to ${fmtDateLong(end)}`;
}

export function formatBucketRangeCompact(point: Pick<TimeSeriesPoint, 'label' | 'rangeStart' | 'rangeEnd' | 'hourStart' | 'hourEnd'>): string {
  if (!point.rangeStart || !point.rangeEnd) return point.label;
  const start = parseIsoDate(point.rangeStart);
  const end = parseIsoDate(point.rangeEnd);
  if (!isValidDate(start) || !isValidDate(end)) return point.label;

  if (typeof point.hourStart === 'number' && typeof point.hourEnd === 'number') {
    const timeRange = `${fmtHour(point.hourStart, 0)}-${fmtHour(point.hourEnd, 59)}`;
    if (point.rangeStart === point.rangeEnd) {
      return `${fmtDateCompact(start)} ${timeRange}`;
    }
    return `${fmtDateCompact(start)} ${fmtHour(point.hourStart, 0)}-${fmtDateCompact(end)} ${fmtHour(point.hourEnd, 59)}`;
  }

  if (point.rangeStart === point.rangeEnd) return fmtDateCompact(start);
  return `${fmtDateCompact(start)}-${fmtDateCompact(end)}`;
}

function fmtInt(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

export function formatLineValueTooltip(point: TimeSeriesPoint, valueLabel: string): string {
  const rangeText = formatBucketRangeLong(point);
  const noun = Math.abs(point.value) === 1 ? valueLabel : `${valueLabel}s`;
  return `${rangeText} - ${fmtInt(point.value)} ${noun}`;
}
