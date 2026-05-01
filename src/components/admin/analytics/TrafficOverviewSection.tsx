import { AnalyticsKpiRow } from './AnalyticsKpiRow';
import { AnalyticsModuleCard } from './AnalyticsModuleCard';
import { DonutWithLegend, HorizontalBars, SimpleLineChart } from './AnalyticsVisuals';
import type { AnalyticsDisplayMode, AnalyticsTimeframe, TrafficOverviewData } from './types';

type TrafficOverviewSectionProps = {
  data: TrafficOverviewData;
  displayMode: AnalyticsDisplayMode;
  compareEnabled: boolean;
  timeframe: AnalyticsTimeframe;
  deltaComparisonBasis?: string;
};

function fmtInt(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

const timeframeAxisLabel = (timeframe: AnalyticsTimeframe): string => {
  switch (timeframe) {
    case 'last7Days':
      return 'Time (Last 7 Days)';
    case 'last30Days':
      return 'Time (Last 30 Days)';
    case 'last90Days':
      return 'Time (Last 90 Days)';
    case 'yearToDate':
      return 'Time (Year to Date)';
    case 'last12Months':
      return 'Time (Last 12 Months)';
    case 'lifetime':
      return 'Time (Lifetime)';
    default:
      return 'Time';
  }
};

function reorderTrafficKpis(metrics: TrafficOverviewData['kpis']): TrafficOverviewData['kpis'] {
  const sessionsMetric = metrics.find((metric) => metric.label === 'Sessions');
  const topSourceMetric = metrics.find((metric) => metric.label === 'Top Source');
  if (!sessionsMetric || !topSourceMetric) return metrics;

  const remaining = metrics.filter((metric) => metric.label !== 'Sessions' && metric.label !== 'Top Source');
  const reordered = [...remaining];
  reordered.splice(1, 0, sessionsMetric);
  reordered.splice(3, 0, topSourceMetric);
  return reordered;
}

export function TrafficOverviewSection({
  data,
  displayMode,
  compareEnabled,
  timeframe,
  deltaComparisonBasis,
}: TrafficOverviewSectionProps) {
  const kpis = reorderTrafficKpis(data.kpis);
  const totalVisitors = data.newVisitors + data.returningVisitors;
  const peakPoint = data.visitorsOverTime.reduce((highest, point) => (point.value > highest.value ? point : highest), data.visitorsOverTime[0]);
  const avgVisitors = data.visitorsOverTime.length
    ? Math.round(data.visitorsOverTime.reduce((sum, point) => sum + point.value, 0) / data.visitorsOverTime.length)
    : 0;

  return (
    <div className="space-y-5">
      <AnalyticsKpiRow
        metrics={kpis}
        compareEnabled={compareEnabled}
        deltaComparisonBasis={deltaComparisonBasis}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <AnalyticsModuleCard
          title="Visitors over time"
          subtitle={displayMode === 'visual' ? 'Visual trend' : 'Trend summary'}
        >
          {displayMode === 'visual' ? (
            <SimpleLineChart
              points={data.visitorsOverTime}
              xAxisLabel={timeframeAxisLabel(timeframe)}
              yAxisLabel="# of Visitors"
              valueLabel="visitor"
              interactiveBucketHover
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-shell border border-driftwood/50 bg-linen/75 p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-deep-ocean/70">Total visitors</p>
                <p className="text-xl font-serif font-semibold text-deep-ocean mt-1">{fmtInt(totalVisitors)}</p>
              </div>
              <div className="rounded-shell border border-driftwood/50 bg-linen/75 p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-deep-ocean/70">Average per period</p>
                <p className="text-xl font-serif font-semibold text-deep-ocean mt-1">{fmtInt(avgVisitors)}</p>
              </div>
              <div className="rounded-shell border border-driftwood/50 bg-linen/75 p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-deep-ocean/70">Peak period</p>
                <p className="text-xl font-serif font-semibold text-deep-ocean mt-1">{peakPoint?.label || '-'}</p>
                <p className="text-xs text-charcoal/70 mt-1">{fmtInt(peakPoint?.value || 0)} visitors</p>
              </div>
            </div>
          )}
        </AnalyticsModuleCard>

        <AnalyticsModuleCard
          title="Traffic sources"
          subtitle={displayMode === 'visual' ? 'Where visitors come from' : 'Ranked sources'}
        >
          {displayMode === 'visual' ? (
            <DonutWithLegend data={data.sourceMix} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-deep-ocean/70">
                    <th className="pb-2">Source</th>
                    <th className="pb-2 text-right">Share</th>
                    <th className="pb-2 text-right">Visitors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-driftwood/35">
                  {data.sourceMix.map((source) => (
                    <tr key={source.name}>
                      <td className="py-2 text-charcoal/85">{source.name}</td>
                      <td className="py-2 text-right text-deep-ocean font-semibold">{source.value}%</td>
                      <td className="py-2 text-right text-charcoal/80">{fmtInt(source.count ?? (source.value / 100) * totalVisitors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AnalyticsModuleCard>

        <AnalyticsModuleCard
          title="Top landing pages"
          subtitle={displayMode === 'visual' ? 'Most visited entry pages' : 'Landing page table'}
        >
          {displayMode === 'visual' ? (
            <HorizontalBars data={data.landingPages.map((item) => ({ label: item.path, value: item.visitors }))} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-deep-ocean/70">
                    <th className="pb-2">Landing Page</th>
                    <th className="pb-2 text-right">Visitors</th>
                    <th className="pb-2 text-right">Engagement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-driftwood/35">
                  {data.landingPages.map((item) => (
                    <tr key={item.path}>
                      <td className="py-2 text-charcoal/85">{item.path}</td>
                      <td className="py-2 text-right text-deep-ocean font-semibold">{fmtInt(item.visitors)}</td>
                      <td className="py-2 text-right text-charcoal/80">{item.engagementPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AnalyticsModuleCard>

        <AnalyticsModuleCard
          title="New vs Returning visitors"
          subtitle={displayMode === 'visual' ? 'Audience mix' : 'Audience split'}
        >
          {displayMode === 'visual' ? (
            <DonutWithLegend
              data={[
                { name: 'New Visitors', value: data.newVisitors },
                { name: 'Returning Visitors', value: data.returningVisitors },
              ]}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-shell border border-driftwood/45 bg-linen/75 p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-deep-ocean/70">New Visitors</p>
                <p className="mt-2 text-2xl font-serif font-semibold text-deep-ocean">{fmtInt(data.newVisitors)}</p>
                <p className="text-xs text-charcoal/70 mt-1">
                  {((data.newVisitors / Math.max(totalVisitors, 1)) * 100).toFixed(1)}% of all visitors
                </p>
              </div>
              <div className="rounded-shell border border-driftwood/45 bg-linen/75 p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-deep-ocean/70">Returning Visitors</p>
                <p className="mt-2 text-2xl font-serif font-semibold text-deep-ocean">{fmtInt(data.returningVisitors)}</p>
                <p className="text-xs text-charcoal/70 mt-1">
                  {((data.returningVisitors / Math.max(totalVisitors, 1)) * 100).toFixed(1)}% of all visitors
                </p>
              </div>
            </div>
          )}
        </AnalyticsModuleCard>
      </div>
    </div>
  );
}
