import { AnalyticsModuleCard } from './AnalyticsModuleCard';
import { HorizontalBars } from './AnalyticsVisuals';
import type { AnalyticsDisplayMode, CategoryPerformanceRow, ProductInterestData, ProductInterestKpiCard } from './types';

type ProductInterestSectionProps = {
  data: ProductInterestData;
  displayMode: AnalyticsDisplayMode;
  compareEnabled: boolean;
};

function fmtInt(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
}

function EmptyModuleState({ message }: { message: string }) {
  return (
    <div className="rounded-shell border border-driftwood/40 bg-linen/70 px-4 py-6 text-sm text-charcoal/75">
      {message}
    </div>
  );
}

function statusTone(status: ProductInterestKpiCard['status']) {
  if (status === 'degraded') return 'border-amber-300/80 bg-amber-50/70';
  if (status === 'empty') return 'border-driftwood/50 bg-linen/70';
  return 'border-driftwood/40 bg-white/90';
}

function statusLabel(status: ProductInterestKpiCard['status']) {
  if (status === 'degraded') return 'Limited';
  if (status === 'empty') return 'No matched data';
  return 'Matched';
}

function ProductInterestKpiCards({ cards }: { cards: ProductInterestKpiCard[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {cards.map((card) => (
        <div key={card.key} className={`lux-card p-4 ${statusTone(card.status)}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-deep-ocean/75">{card.title}</p>
            <span className="text-[10px] uppercase tracking-[0.14em] text-deep-ocean/70">{statusLabel(card.status)}</span>
          </div>
          <p className="mt-2 text-xl font-serif font-semibold text-deep-ocean">
            {card.productName || (card.status === 'degraded' ? 'Coverage limited' : 'No matched product')}
          </p>
          {typeof card.metricValue === 'number' ? (
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-charcoal/75">
              {fmtInt(card.metricValue)} {card.metricLabel}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-charcoal/75">{card.message}</p>
          {card.coverageNote ? <p className="mt-1 text-[11px] text-charcoal/70">{card.coverageNote}</p> : null}
        </div>
      ))}
    </div>
  );
}

function CategoryComparisonBars({ rows, degradedViews }: { rows: CategoryPerformanceRow[]; degradedViews: boolean }) {
  const maxViews = Math.max(1, ...rows.map((row) => row.views));
  const maxOrders = Math.max(1, ...rows.map((row) => row.orders));
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const viewWidth = (row.views / maxViews) * 100;
        const orderWidth = (row.orders / maxOrders) * 100;
        return (
          <div key={row.category} className="rounded-shell border border-driftwood/35 bg-linen/55 p-3">
            <p className="text-xs font-semibold text-deep-ocean">{row.category}</p>
            <div className="mt-2 space-y-2">
              <div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-deep-ocean/70">
                  <span>{degradedViews ? 'Views (matched)' : 'Views'}</span>
                  <span>{fmtInt(row.views)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-driftwood/30 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${degradedViews ? 'bg-gradient-to-r from-[#CFBFA8] to-[#8F7C65]' : 'bg-gradient-to-r from-sea-glass to-deep-ocean'}`}
                    style={{ width: `${Math.max(4, viewWidth)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-deep-ocean/70">
                  <span>Orders</span>
                  <span>{fmtInt(row.orders)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-driftwood/30 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#CBBFAF] to-[#8A7762]" style={{ width: `${Math.max(4, orderWidth)}%` }} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProductInterestSection({ data, displayMode, compareEnabled }: ProductInterestSectionProps) {
  void compareEnabled;
  const categoryViewsDegraded = data.moduleStates.categoryPerformance.state === 'degraded';

  return (
    <div className="space-y-5">
      <ProductInterestKpiCards cards={data.kpiCards} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <AnalyticsModuleCard
          title="Top Viewed Products"
          subtitle={displayMode === 'visual' ? 'Matched product views' : 'Views with cart and order context'}
        >
          {!data.topViewedProducts.length ? (
            <EmptyModuleState message={data.moduleStates.topViewedProducts.message} />
          ) : displayMode === 'visual' ? (
            <HorizontalBars
              data={data.topViewedProducts.slice(0, 8).map((row) => ({ label: row.name, value: row.views }))}
              valueFormatter={(value) => `${fmtInt(value)} views`}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-deep-ocean/70">
                    <th className="pb-2">Product</th>
                    <th className="pb-2 text-right">Views</th>
                    <th className="pb-2 text-right">Add to Carts</th>
                    <th className="pb-2 text-right">Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-driftwood/35">
                  {data.topViewedProducts.map((row) => (
                    <tr key={`${row.category}:${row.name}`}>
                      <td className="py-2">
                        <div className="text-charcoal/90">{row.name}</div>
                        <div className="text-[10px] uppercase tracking-[0.14em] text-deep-ocean/65">{row.category}</div>
                      </td>
                      <td className="py-2 text-right text-charcoal/85">{fmtInt(row.views)}</td>
                      <td className="py-2 text-right text-charcoal/85">{fmtInt(row.addToCarts)}</td>
                      <td className="py-2 text-right font-semibold text-deep-ocean">{fmtInt(row.orders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AnalyticsModuleCard>

        <AnalyticsModuleCard
          title="Products With No Views"
          subtitle={displayMode === 'visual' ? 'Listed products with zero matched views' : 'Zero-view listed product list'}
        >
          {!data.productsWithNoViews.length ? (
            <EmptyModuleState message={data.moduleStates.productsWithNoViews.message} />
          ) : displayMode === 'visual' ? (
            <div className="space-y-2">
              {data.productsWithNoViews.slice(0, 10).map((row) => (
                <div key={`${row.category}:${row.name}`} className="rounded-shell border border-driftwood/35 bg-linen/65 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-deep-ocean">{row.name}</p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-deep-ocean/65">{row.category}</p>
                  </div>
                  <p className="mt-1 text-xs text-charcoal/75">
                    {fmtInt(row.addToCarts)} adds to cart, {fmtInt(row.orders)} orders
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-deep-ocean/70">
                    <th className="pb-2">Product</th>
                    <th className="pb-2">Category</th>
                    <th className="pb-2 text-right">Add to Carts</th>
                    <th className="pb-2 text-right">Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-driftwood/35">
                  {data.productsWithNoViews.map((row) => (
                    <tr key={`${row.category}:${row.name}`}>
                      <td className="py-2 text-charcoal/90">{row.name}</td>
                      <td className="py-2 text-charcoal/80">{row.category}</td>
                      <td className="py-2 text-right text-charcoal/85">{fmtInt(row.addToCarts)}</td>
                      <td className="py-2 text-right font-semibold text-deep-ocean">{fmtInt(row.orders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AnalyticsModuleCard>

        <AnalyticsModuleCard
          title="Category Performance"
          subtitle={displayMode === 'visual' ? 'Views vs orders by category' : 'Category views and orders'}
        >
          {data.moduleStates.categoryPerformance.state !== 'ok' ? (
            <div
              className={`mb-3 rounded-shell border px-3 py-2 text-xs ${
                data.moduleStates.categoryPerformance.state === 'degraded'
                  ? 'border-amber-300/80 bg-amber-50/65 text-charcoal/85'
                  : 'border-driftwood/45 bg-linen/70 text-charcoal/80'
              }`}
            >
              {data.moduleStates.categoryPerformance.message}
            </div>
          ) : null}
          {!data.categoryPerformance.length ? (
            <EmptyModuleState message={data.moduleStates.categoryPerformance.message} />
          ) : displayMode === 'visual' ? (
            <CategoryComparisonBars rows={data.categoryPerformance} degradedViews={categoryViewsDegraded} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-deep-ocean/70">
                    <th className="pb-2">Category</th>
                    <th className="pb-2 text-right">{categoryViewsDegraded ? 'Views (Matched)' : 'Views'}</th>
                    <th className="pb-2 text-right">Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-driftwood/35">
                  {data.categoryPerformance.map((row) => (
                    <tr key={row.category}>
                      <td className="py-2 text-charcoal/90">{row.category}</td>
                      <td className="py-2 text-right text-charcoal/85">{fmtInt(row.views)}</td>
                      <td className="py-2 text-right font-semibold text-deep-ocean">{fmtInt(row.orders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AnalyticsModuleCard>

        <AnalyticsModuleCard
          title="Custom Orders vs Listed Products"
          subtitle={displayMode === 'visual' ? 'Completed orders comparison' : 'Sales/orders comparison'}
        >
          {displayMode === 'visual' ? (
            <HorizontalBars
              data={data.customOrdersVsListed.map((row) => ({ label: row.name, value: row.orders }))}
              valueFormatter={(value) => `${fmtInt(value)} orders`}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-deep-ocean/70">
                    <th className="pb-2">Segment</th>
                    <th className="pb-2 text-right">Orders</th>
                    <th className="pb-2 text-right">Purchases</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-driftwood/35">
                  {data.customOrdersVsListed.map((row) => (
                    <tr key={row.name}>
                      <td className="py-2 text-charcoal/90">{row.name}</td>
                      <td className="py-2 text-right font-semibold text-deep-ocean">{fmtInt(row.orders)}</td>
                      <td className="py-2 text-right text-charcoal/85">{fmtInt(row.purchases)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AnalyticsModuleCard>

        <AnalyticsModuleCard
          title="Added to Cart But Not Purchased"
          subtitle={displayMode === 'visual' ? 'Matched cart intent with low purchase follow-through' : 'Cart-intent follow-through detail'}
          className="xl:col-span-2"
        >
          {!data.addedToCartWithoutPurchase.length ? (
            <EmptyModuleState message={data.moduleStates.addedToCartWithoutPurchase.message} />
          ) : displayMode === 'visual' ? (
            <HorizontalBars
              data={data.addedToCartWithoutPurchase.map((row) => ({ label: row.name, value: row.addToCarts }))}
              valueFormatter={(value) => `${fmtInt(value)} adds to cart`}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-deep-ocean/70">
                    <th className="pb-2">Product</th>
                    <th className="pb-2 text-right">Add to Carts</th>
                    <th className="pb-2 text-right">Views</th>
                    <th className="pb-2 text-right">Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-driftwood/35">
                  {data.addedToCartWithoutPurchase.map((row) => (
                    <tr key={`${row.category}:${row.name}`}>
                      <td className="py-2">
                        <div className="text-charcoal/90">{row.name}</div>
                        <div className="text-[10px] uppercase tracking-[0.14em] text-deep-ocean/65">{row.category}</div>
                      </td>
                      <td className="py-2 text-right font-semibold text-deep-ocean">{fmtInt(row.addToCarts)}</td>
                      <td className="py-2 text-right text-charcoal/85">{fmtInt(row.views)}</td>
                      <td className="py-2 text-right text-charcoal/85">{fmtInt(row.orders)}</td>
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
