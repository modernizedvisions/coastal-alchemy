import { AnalyticsKpiRow } from './AnalyticsKpiRow';
import { AnalyticsModuleCard } from './AnalyticsModuleCard';
import { FunnelVisual, HorizontalBars, PercentProgressList, SimpleLineChart, SIMPLE_LINE_SERIES_STYLES } from './AnalyticsVisuals';
import type { AnalyticsDisplayMode, CustomerActionsData } from './types';

type CustomerActionsSectionProps = {
  data: CustomerActionsData;
  displayMode: AnalyticsDisplayMode;
  compareEnabled: boolean;
};

function fmtInt(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

const customerTrendLegend = [
  { label: 'Add to Cart', style: SIMPLE_LINE_SERIES_STYLES.primary },
  { label: 'Begin Checkout', style: SIMPLE_LINE_SERIES_STYLES.secondary },
  { label: 'Confirmed Orders', style: SIMPLE_LINE_SERIES_STYLES.tertiary },
];

const funnelSourceNote =
  'Product Views, Add to Cart, and Begin Checkout are GA4 storefront events. Final step uses confirmed checkout orders from the order database.';

export function CustomerActionsSection({ data, displayMode, compareEnabled }: CustomerActionsSectionProps) {
  return (
    <div className="space-y-5">
      <AnalyticsKpiRow metrics={data.kpis} compareEnabled={compareEnabled} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <AnalyticsModuleCard
          title="Customer funnel"
          subtitle={displayMode === 'visual' ? 'Storefront events to confirmed orders' : 'Step counts and source alignment'}
        >
          {displayMode === 'visual' ? (
            <div className="space-y-3">
              <FunnelVisual steps={data.funnel.map((step) => ({ label: step.label, count: step.count }))} />
              <p className="text-xs text-charcoal/70">{funnelSourceNote}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-deep-ocean/70">
                      <th className="pb-2">Step</th>
                      <th className="pb-2 text-right">Count</th>
                      <th className="pb-2 text-right">From Previous</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-driftwood/35">
                    {data.funnel.map((step) => (
                      <tr key={step.label}>
                        <td className="py-2 text-charcoal/85">{step.label}</td>
                        <td className="py-2 text-right font-semibold text-deep-ocean">{fmtInt(step.count)}</td>
                        <td className="py-2 text-right text-charcoal/80">
                          {typeof step.conversionPctFromPrevious === 'number' ? fmtPct(step.conversionPctFromPrevious) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-charcoal/70">{funnelSourceNote}</p>
            </div>
          )}
        </AnalyticsModuleCard>

        <AnalyticsModuleCard title="Lead actions" subtitle={displayMode === 'visual' ? 'Contact and signup activity' : 'Lead action totals'}>
          {displayMode === 'visual' ? (
            <HorizontalBars data={data.leadActions.map((item) => ({ label: item.name, value: item.value }))} />
          ) : (
            <div className="space-y-2">
              {data.leadActions.map((item) => (
                <div key={item.name} className="rounded-shell border border-driftwood/40 bg-linen/75 px-3 py-2 flex items-center justify-between">
                  <p className="text-sm text-charcoal/85">{item.name}</p>
                  <p className="text-lg font-serif font-semibold text-deep-ocean">{fmtInt(item.value)}</p>
                </div>
              ))}
            </div>
          )}
        </AnalyticsModuleCard>

        <AnalyticsModuleCard title="Conversion rates" subtitle={displayMode === 'visual' ? 'Key conversion percentages' : 'Rate breakdown'}>
          {displayMode === 'visual' ? (
            <PercentProgressList rates={data.conversionRates} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {data.conversionRates.map((rate) => (
                <div key={rate.label} className="rounded-shell border border-driftwood/40 bg-linen/75 p-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-deep-ocean/70">{rate.label}</p>
                  <p className="mt-2 text-xl font-serif font-semibold text-deep-ocean">{fmtPct(rate.value)}</p>
                </div>
              ))}
            </div>
          )}
        </AnalyticsModuleCard>

        <AnalyticsModuleCard
          title="Customer action trends"
          subtitle={displayMode === 'visual' ? 'Add to cart, checkout, and confirmed orders over time' : 'Trend summary by period'}
        >
          {displayMode === 'visual' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                {customerTrendLegend.map((item) => (
                  <div key={item.label} className="inline-flex items-center gap-2 rounded-full border border-driftwood/40 bg-linen/70 px-3 py-1.5">
                    <span
                      className="inline-block w-6 border-t-2"
                      style={{
                        borderTopColor: item.style.color,
                        borderTopStyle: item.style.dashArray ? 'dashed' : 'solid',
                      }}
                      aria-hidden="true"
                    />
                    <span className="text-[11px] uppercase tracking-[0.12em] text-deep-ocean/80">{item.label}</span>
                  </div>
                ))}
              </div>
              <SimpleLineChart
                points={data.actionsOverTime}
                seriesLabels={{
                  primary: 'Add to Cart',
                  secondary: 'Begin Checkout',
                  tertiary: 'Confirmed Orders',
                }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-deep-ocean/70">
                    <th className="pb-2">Period</th>
                    <th className="pb-2 text-right">Add to Cart</th>
                    <th className="pb-2 text-right">Begin Checkout</th>
                    <th className="pb-2 text-right">Confirmed Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-driftwood/35">
                  {data.actionsOverTime.map((point) => (
                    <tr key={point.label}>
                      <td className="py-2 text-charcoal/85">{point.label}</td>
                      <td className="py-2 text-right">{fmtInt(point.value)}</td>
                      <td className="py-2 text-right">{fmtInt(point.secondaryValue || 0)}</td>
                      <td className="py-2 text-right font-semibold text-deep-ocean">{fmtInt(point.tertiaryValue || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AnalyticsModuleCard>
      </div>
    </div>
  );
}
