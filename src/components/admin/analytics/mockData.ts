import type {
  AnalyticsSnapshot,
  AnalyticsTimeframe,
  CategoryPerformanceRow,
  KpiMetric,
  LandingPageDatum,
  NameValueDatum,
  ProductPerformanceRow,
  ProductInterestKpiCard,
  TimeSeriesPoint,
  ZeroViewProductRow,
} from './types';
import { ANALYTICS_TIMEFRAMES } from './timeframes';

const TRAFFIC_SERIES_BASE = [540, 612, 588, 690, 736, 802, 781, 864, 922, 978, 1020, 1095];
const ACTION_SERIES_BASE = [52, 57, 55, 61, 64, 68, 72, 79, 84, 87, 91, 98];

const SOURCE_BASE: NameValueDatum[] = [
  { name: 'Direct', value: 34 },
  { name: 'Instagram', value: 28 },
  { name: 'Google Search', value: 18 },
  { name: 'TikTok', value: 10 },
  { name: 'Email', value: 7 },
  { name: 'Referral', value: 3 },
];

const LANDING_BASE: LandingPageDatum[] = [
  { path: '/', visitors: 1460, engagementPct: 42 },
  { path: '/shop', visitors: 1820, engagementPct: 47 },
  { path: '/product/shell-ring-dish', visitors: 960, engagementPct: 39 },
  { path: '/custom-orders', visitors: 540, engagementPct: 44 },
  { path: '/join', visitors: 280, engagementPct: 36 },
];

const PRODUCT_ROWS_BASE: ProductPerformanceRow[] = [
  { name: 'Shell Ring Dish', category: 'Ring Dishes', views: 1420, addToCarts: 104, purchases: 18, orders: 15 },
  { name: 'Starfish Ornament', category: 'Ornaments', views: 1180, addToCarts: 132, purchases: 24, orders: 20 },
  { name: 'Oyster Shell Frame', category: 'Wall Art', views: 1050, addToCarts: 68, purchases: 20, orders: 17 },
  { name: 'Coastal Wall Art', category: 'Wall Art', views: 990, addToCarts: 54, purchases: 22, orders: 18 },
  { name: 'Wedding Place Cards', category: 'Coastal Decor', views: 760, addToCarts: 46, purchases: 16, orders: 12 },
  { name: 'Custom Order', category: 'Custom Orders', views: 0, addToCarts: 0, purchases: 12, orders: 4 },
];

const CATEGORY_ROWS_BASE: CategoryPerformanceRow[] = [
  { category: 'Ring Dishes', views: 2260, purchases: 30, orders: 24 },
  { category: 'Ornaments', views: 1940, purchases: 36, orders: 28 },
  { category: 'Wall Art', views: 1620, purchases: 32, orders: 25 },
  { category: 'Coastal Decor', views: 1360, purchases: 20, orders: 15 },
  { category: 'Holiday', views: 0, purchases: 0, orders: 0 },
];

const LEAD_BASE: Array<{ name: string; value: number }> = [
  { name: 'Contact Form Submissions', value: 42 },
  { name: 'Custom Order Requests', value: 19 },
  { name: 'Email Signups', value: 76 },
];

function fmtInt(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
}

function scaleCount(value: number, multiplier: number, minimum = 0): number {
  return Math.max(minimum, Math.round(value * multiplier));
}

function trendLabelsFor(timeframe: AnalyticsTimeframe): string[] {
  switch (timeframe) {
    case 'last7Days':
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    case 'last30Days':
      return ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    case 'last90Days':
      return ['Month 1', 'Month 2', 'Month 3'];
    case 'yearToDate':
      return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    case 'last12Months':
      return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    case 'lifetime':
      return ['2022', '2023', '2024', '2025', '2026'];
    default:
      return ['Period 1', 'Period 2', 'Period 3', 'Period 4'];
  }
}

function projectSeries(base: number[], labels: string[], multiplier: number): TimeSeriesPoint[] {
  if (!labels.length) return [];
  if (labels.length === 1) {
    return [{ label: labels[0], value: scaleCount(base[base.length - 1] || 1, multiplier, 1) }];
  }
  return labels.map((label, index) => {
    const ratio = index / (labels.length - 1);
    const baseIndex = Math.min(base.length - 1, Math.round(ratio * (base.length - 1)));
    return {
      label,
      value: scaleCount(base[baseIndex] || 1, multiplier, 1),
    };
  });
}

function buildTrafficKpis(totalVisitors: number, sessions: number): KpiMetric[] {
  const newVisitors = Math.round(totalVisitors * 0.74);
  const returningVisitors = Math.max(0, totalVisitors - newVisitors);
  return [
    { label: 'Total Visitors', value: fmtInt(totalVisitors), deltaPct: 12.1 },
    { label: 'New Visitors', value: fmtInt(newVisitors), deltaPct: 8.4 },
    { label: 'Returning Visitors', value: fmtInt(returningVisitors), deltaPct: 18.7 },
    { label: 'Sessions', value: fmtInt(sessions), deltaPct: 10.3 },
    { label: 'Top Source', value: 'Instagram', helper: 'Most sessions from social' },
    { label: 'Avg. Pages per Visit', value: '2.8', deltaPct: 5.2 },
  ];
}

function buildProductInterestKpiCards(rows: ProductPerformanceRow[]): ProductInterestKpiCard[] {
  const topViewed = [...rows].sort((a, b) => b.views - a.views)[0];
  const topAdded = [...rows].sort((a, b) => b.addToCarts - a.addToCarts)[0];
  return [
    {
      key: 'topViewedProduct',
      title: 'Top Viewed Product',
      status: topViewed ? 'ok' : 'empty',
      productName: topViewed?.name || null,
      metricValue: topViewed?.views || null,
      metricLabel: 'views',
      message: topViewed ? `${fmtInt(topViewed.views)} matched views` : 'Not enough matched product-view data for this period.',
    },
    {
      key: 'mostAddedToCartProduct',
      title: 'Most Added-to-Cart Product',
      status: topAdded ? 'ok' : 'empty',
      productName: topAdded?.name || null,
      metricValue: topAdded?.addToCarts || null,
      metricLabel: 'adds to cart',
      message: topAdded ? `${fmtInt(topAdded.addToCarts)} matched adds to cart` : 'No matched add-to-cart product data for this period.',
    },
  ];
}

function buildCustomerActionKpis(
  addToCart: number,
  beginCheckout: number,
  purchases: number,
  leads: Array<{ name: string; value: number }>
): KpiMetric[] {
  const contact = leads.find((item) => item.name.includes('Contact'))?.value || 0;
  const customOrders = leads.find((item) => item.name.includes('Custom Order'))?.value || 0;
  const emailSignups = leads.find((item) => item.name.includes('Email'))?.value || 0;

  return [
    { label: 'Add to Carts', value: fmtInt(addToCart), deltaPct: 7.3 },
    { label: 'Checkout Starts', value: fmtInt(beginCheckout), deltaPct: 4.6 },
    { label: 'Purchases', value: fmtInt(purchases), deltaPct: 6.8 },
    { label: 'Contact Form Submissions', value: fmtInt(contact), deltaPct: -3.1 },
    { label: 'Custom Order Requests', value: fmtInt(customOrders), deltaPct: 14.2 },
    { label: 'Email Signups', value: fmtInt(emailSignups), deltaPct: 11.7 },
  ];
}

function scaleProductRows(rows: ProductPerformanceRow[], multiplier: number): ProductPerformanceRow[] {
  return rows.map((row) => ({
    ...row,
    views: scaleCount(row.views, multiplier, 0),
    addToCarts: scaleCount(row.addToCarts, multiplier, 0),
    purchases: scaleCount(row.purchases, multiplier, 0),
    orders: scaleCount(row.orders, multiplier, 0),
  }));
}

function scaleCategoryRows(rows: CategoryPerformanceRow[], multiplier: number): CategoryPerformanceRow[] {
  return rows.map((row) => ({
    ...row,
    views: scaleCount(row.views, multiplier, 0),
    purchases: scaleCount(row.purchases, multiplier, 0),
    orders: scaleCount(row.orders, multiplier, 0),
  }));
}

function scaleLeadRows(rows: Array<{ name: string; value: number }>, multiplier: number): Array<{ name: string; value: number }> {
  return rows.map((row) => ({ ...row, value: scaleCount(row.value, multiplier, 0) }));
}

export function getAnalyticsSnapshot(timeframe: AnalyticsTimeframe): AnalyticsSnapshot {
  const timeframeMeta = ANALYTICS_TIMEFRAMES.find((option) => option.key === timeframe) || ANALYTICS_TIMEFRAMES[1];
  const labels = trendLabelsFor(timeframeMeta.key);
  const visitorsOverTime = projectSeries(TRAFFIC_SERIES_BASE, labels, timeframeMeta.multiplier);
  const actionsOverTimeBase = projectSeries(ACTION_SERIES_BASE, labels, timeframeMeta.multiplier);

  const totalVisitors = visitorsOverTime.reduce((sum, point) => sum + point.value, 0);
  const totalSessions = Math.round(totalVisitors * 1.27);
  const newVisitors = Math.round(totalVisitors * 0.74);
  const returningVisitors = Math.max(0, totalVisitors - newVisitors);

  const landingPages = LANDING_BASE.map((item) => ({
    ...item,
    visitors: scaleCount(item.visitors, timeframeMeta.multiplier, 1),
  })).sort((a, b) => b.visitors - a.visitors);

  const scaledProductRows = scaleProductRows(PRODUCT_ROWS_BASE, timeframeMeta.multiplier);
  const scaledCategoryRows = scaleCategoryRows(CATEGORY_ROWS_BASE, timeframeMeta.multiplier);
  const scaledLeads = scaleLeadRows(LEAD_BASE, timeframeMeta.multiplier);
  const productKpiCards = buildProductInterestKpiCards(scaledProductRows.filter((row) => row.category !== 'Custom Orders'));
  const topViewedProducts = [...scaledProductRows]
    .filter((row) => row.category !== 'Custom Orders' && row.views > 0)
    .sort((a, b) => (b.views - a.views) || (b.addToCarts - a.addToCarts))
    .slice(0, 8);
  const productsWithNoViews: ZeroViewProductRow[] = [
    { name: 'Mini Coral Frame', category: 'Wall Art', views: 0, addToCarts: 2, purchases: 0, orders: 0 },
    { name: 'Shell Napkin Ring Set', category: 'Coastal Decor', views: 0, addToCarts: 0, purchases: 0, orders: 0 },
  ];
  const addedToCartWithoutPurchase = [...scaledProductRows]
    .filter((row) => row.category !== 'Custom Orders' && row.addToCarts > 0 && row.orders === 0)
    .sort((a, b) => b.addToCarts - a.addToCarts)
    .slice(0, 8);
  const customOrdersVsListed = [
    {
      name: 'Custom Orders',
      orders: scaledProductRows
        .filter((row) => row.category === 'Custom Orders')
        .reduce((sum, row) => sum + row.orders, 0),
      purchases: scaledProductRows
        .filter((row) => row.category === 'Custom Orders')
        .reduce((sum, row) => sum + row.purchases, 0),
    },
    {
      name: 'Listed Products',
      orders: scaledProductRows
        .filter((row) => row.category !== 'Custom Orders')
        .reduce((sum, row) => sum + row.orders, 0),
      purchases: scaledProductRows
        .filter((row) => row.category !== 'Custom Orders')
        .reduce((sum, row) => sum + row.purchases, 0),
    },
  ];

  const addToCartTotal = scaledProductRows.reduce((sum, row) => sum + row.addToCarts, 0);
  const purchaseTotal = scaledProductRows.reduce((sum, row) => sum + row.purchases, 0);
  const beginCheckoutTotal = Math.max(purchaseTotal, Math.round(addToCartTotal * 0.42));
  const productViewTotal = scaledProductRows.reduce((sum, row) => sum + row.views, 0);

  const conversionRates = [
    {
      label: 'View -> Cart',
      value: productViewTotal > 0 ? (addToCartTotal / productViewTotal) * 100 : 0,
    },
    {
      label: 'Cart -> Checkout',
      value: addToCartTotal > 0 ? (beginCheckoutTotal / addToCartTotal) * 100 : 0,
    },
    {
      label: 'Checkout -> Confirmed Order',
      value: beginCheckoutTotal > 0 ? (purchaseTotal / beginCheckoutTotal) * 100 : 0,
    },
  ];

  const actionTrend = actionsOverTimeBase.map((point) => ({
    label: point.label,
    value: point.value,
    secondaryValue: Math.max(1, Math.round(point.value * 0.42)),
    tertiaryValue: Math.max(1, Math.round(point.value * 0.25)),
  }));

  return {
    timeframe: timeframeMeta,
    trafficOverview: {
      kpis: buildTrafficKpis(totalVisitors, totalSessions),
      visitorsOverTime,
      sourceMix: SOURCE_BASE,
      landingPages,
      newVisitors,
      returningVisitors,
      insight: 'Instagram brought the most traffic in this period, and returning visitors are trending up.',
    },
    productInterest: {
      kpiCards: productKpiCards,
      topViewedProducts,
      productsWithNoViews,
      categoryPerformance: scaledCategoryRows,
      customOrdersVsListed,
      addedToCartWithoutPurchase,
      moduleStates: {
        topViewedProducts: {
          state: topViewedProducts.length ? 'ok' : 'empty',
          message: topViewedProducts.length
            ? 'Matched product views are available for this period.'
            : 'Not enough matched product-view data for this period.',
        },
        productsWithNoViews: {
          state: productsWithNoViews.length ? 'ok' : 'empty',
          message: productsWithNoViews.length
            ? 'Listed products with no reliable matched views are shown below.'
            : 'All listed products with reliable matched data have at least one view this period.',
        },
        addedToCartWithoutPurchase: {
          state: addedToCartWithoutPurchase.length ? 'ok' : 'empty',
          message: addedToCartWithoutPurchase.length
            ? 'Matched cart-intent products with limited purchase follow-through are shown below.'
            : 'No matched cart-intent products with low purchase follow-through in this period.',
        },
        categoryPerformance: {
          state: 'ok',
          message: 'Category views and orders are available for this period.',
        },
      },
      coverage: {
        viewCoverageLimited: false,
        cartCoverageLimited: false,
        behaviorQueryFallbackUsed: false,
        behaviorQueryError: null,
        matchedViewEventCount: productViewTotal,
        totalViewEventCount: productViewTotal,
        viewMatchCoveragePct: 100,
        matchedCartEventCount: addToCartTotal,
        totalCartEventCount: addToCartTotal,
        cartMatchCoveragePct: 100,
      },
      insight: 'Shell Ring Dish leads views, while cart-interest-without-order rows identify products to monitor.',
    },
    customerActions: {
      kpis: buildCustomerActionKpis(addToCartTotal, beginCheckoutTotal, purchaseTotal, scaledLeads),
      funnel: [
        { label: 'Product Views', count: productViewTotal },
        { label: 'Add to Cart', count: addToCartTotal, conversionPctFromPrevious: conversionRates[0].value },
        { label: 'Begin Checkout', count: beginCheckoutTotal, conversionPctFromPrevious: conversionRates[1].value },
        { label: 'Confirmed Orders', count: purchaseTotal, conversionPctFromPrevious: conversionRates[2].value },
      ],
      leadActions: scaledLeads,
      conversionRates,
      actionsOverTime: actionTrend,
      insight: 'There is a healthy cart-to-checkout flow, and email signups are up versus the previous period.',
    },
  };
}

export function getCompareText(timeframe: AnalyticsTimeframe): string {
  const meta = ANALYTICS_TIMEFRAMES.find((option) => option.key === timeframe) || ANALYTICS_TIMEFRAMES[1];
  return meta.compareLabel;
}
