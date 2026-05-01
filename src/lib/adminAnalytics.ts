import { adminFetch } from './adminAuth';
import type { AnalyticsSnapshot, AnalyticsTimeframe } from '../components/admin/analytics/types';

type SnapshotResponse = {
  snapshot?: AnalyticsSnapshot;
  error?: string;
  detail?: string;
};

export async function fetchAdminAnalyticsSnapshot(timeframe: AnalyticsTimeframe): Promise<AnalyticsSnapshot> {
  const response = await adminFetch(`/api/admin/analytics?timeframe=${encodeURIComponent(timeframe)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as SnapshotResponse | null;
  if (!response.ok) {
    const detail = payload?.detail || payload?.error || `Analytics request failed (${response.status})`;
    throw new Error(detail);
  }

  if (!payload?.snapshot) {
    throw new Error('Analytics response missing snapshot payload');
  }

  return payload.snapshot;
}

