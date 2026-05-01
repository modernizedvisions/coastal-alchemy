import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminAuth';
import { fetchAdminAnalyticsSnapshot } from '../lib/adminAnalytics';
import { AnalyticsPageHeader } from '../components/admin/analytics/AnalyticsPageHeader';
import { AnalyticsSectionTabs } from '../components/admin/analytics/AnalyticsSectionTabs';
import { CustomerActionsSection } from '../components/admin/analytics/CustomerActionsSection';
import { ProductInterestSection } from '../components/admin/analytics/ProductInterestSection';
import { TrafficOverviewSection } from '../components/admin/analytics/TrafficOverviewSection';
import type {
  AnalyticsDisplayMode,
  AnalyticsSnapshot,
  AnalyticsTabKey,
  AnalyticsTimeframe,
} from '../components/admin/analytics/types';

type AuthState = 'checking' | 'ready';

const DEFAULT_DISPLAY_MODE_BY_TAB: Record<AnalyticsTabKey, AnalyticsDisplayMode> = {
  trafficOverview: 'visual',
  productInterest: 'visual',
  customerActions: 'visual',
};

export function AdminAnalyticsPage() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [activeTab, setActiveTab] = useState<AnalyticsTabKey>('trafficOverview');
  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>('last30Days');
  const [snapshotByTimeframe, setSnapshotByTimeframe] = useState<Partial<Record<AnalyticsTimeframe, AnalyticsSnapshot>>>({});
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [displayModeByTab, setDisplayModeByTab] = useState<Record<AnalyticsTabKey, AnalyticsDisplayMode>>(
    DEFAULT_DISPLAY_MODE_BY_TAB
  );

  const snapshot = snapshotByTimeframe[timeframe] || null;
  const displayMode = displayModeByTab[activeTab];
  const compareEnabled = snapshot?.timeframe.hasComparison ?? (timeframe !== 'lifetime');
  const trafficDeltaComparisonBasis =
    compareEnabled && snapshot?.timeframe.compareLabel
      ? `compared to ${snapshot.timeframe.compareLabel}`
      : undefined;

  useEffect(() => {
    const handler = () => {
      window.location.href = '/admin';
    };
    window.addEventListener('admin-auth-required', handler as EventListener);
    return () => window.removeEventListener('admin-auth-required', handler as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const verifySession = async () => {
      try {
        const response = await adminFetch('/api/admin/auth/me', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error('Admin session check failed.');
        }
        if (!cancelled) {
          setAuthState('ready');
        }
      } catch {
        if (!cancelled) {
          window.location.href = '/admin';
        }
      }
    };
    void verifySession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      window.location.href = '/admin';
    }
  };

  const setDisplayMode = (mode: AnalyticsDisplayMode) => {
    setDisplayModeByTab((previous) => ({
      ...previous,
      [activeTab]: mode,
    }));
  };

  useEffect(() => {
    if (authState !== 'ready') return;
    const cached = snapshotByTimeframe[timeframe];
    if (cached) {
      setIsSnapshotLoading(false);
      return;
    }

    let cancelled = false;
    setIsSnapshotLoading(true);
    setSnapshotError(null);

    const loadSnapshot = async () => {
      try {
        const nextSnapshot = await fetchAdminAnalyticsSnapshot(timeframe);
        if (cancelled) return;
        setSnapshotByTimeframe((previous) => ({
          ...previous,
          [timeframe]: nextSnapshot,
        }));
        setIsSnapshotLoading(false);
      } catch (error) {
        if (cancelled) return;
        console.error('[AdminAnalyticsPage] Failed to load analytics snapshot', error);
        const message = error instanceof Error ? error.message : 'Failed to load analytics';
        setSnapshotError(message);
        setIsSnapshotLoading(false);
      }
    };

    void loadSnapshot();

    return () => {
      cancelled = true;
    };
  }, [authState, timeframe, snapshotByTimeframe]);

  const retrySnapshotLoad = () => {
    setSnapshotByTimeframe((previous) => {
      const next = { ...previous };
      delete next[timeframe];
      return next;
    });
  };

  if (authState === 'checking') {
    return (
      <div className="admin-dashboard ca-admin-shell py-12 overflow-x-hidden">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lux-card p-8 text-center">
            <h1 className="lux-heading text-2xl">Loading analytics preview...</h1>
            <p className="ca-admin-subheading text-sm mt-2">Checking admin access.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard ca-admin-shell py-12 overflow-x-hidden">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <AnalyticsPageHeader onBackToAdmin={() => (window.location.href = '/admin/customers')} onLogout={handleLogout} />

        <AnalyticsSectionTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          displayMode={displayMode}
          onDisplayModeChange={setDisplayMode}
          timeframeLabel={snapshot?.timeframe.label || 'Loading...'}
        />

        {snapshotError && !snapshot ? (
          <div className="lux-card p-6">
            <h3 className="ca-admin-heading text-2xl">Analytics unavailable</h3>
            <p className="ca-admin-subheading text-sm mt-2">{snapshotError}</p>
            <button onClick={retrySnapshotLoad} className="lux-button--ghost mt-4 px-4 py-2 text-[10px]">
              Retry
            </button>
          </div>
        ) : null}

        {isSnapshotLoading && !snapshot ? (
          <div className="lux-card p-6">
            <h3 className="ca-admin-heading text-2xl">Loading analytics...</h3>
            <p className="ca-admin-subheading text-sm mt-2">Fetching live storefront and order metrics.</p>
          </div>
        ) : null}

        {activeTab === 'trafficOverview' && snapshot ? (
          <TrafficOverviewSection
            data={snapshot.trafficOverview}
            displayMode={displayMode}
            compareEnabled={compareEnabled}
            timeframe={snapshot.timeframe.key}
            deltaComparisonBasis={trafficDeltaComparisonBasis}
          />
        ) : null}

        {activeTab === 'productInterest' && snapshot ? (
          <ProductInterestSection data={snapshot.productInterest} displayMode={displayMode} compareEnabled={compareEnabled} />
        ) : null}

        {activeTab === 'customerActions' && snapshot ? (
          <CustomerActionsSection data={snapshot.customerActions} displayMode={displayMode} compareEnabled={compareEnabled} />
        ) : null}
      </div>
    </div>
  );
}
