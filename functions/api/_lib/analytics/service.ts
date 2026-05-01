import {
  bucketDateSeries,
  queryEventByDate,
  queryEventTotals,
  queryGenerateLeadByFormType,
  queryLandingPages,
  queryProductBehavior,
  queryReturningVisitors,
  queryTrafficSources,
  queryTrafficTotals,
  queryVisitorsByDate,
  type ProductBehaviorRow,
} from './ga4Queries';
import {
  loadCatalogMaps,
  loadMessageTypeCounts,
  loadPurchaseMetrics,
  resolveCatalogProductAlias,
  type CatalogAliasResolution,
  type CatalogMaps,
  type D1Database,
} from './db';
import { buildTimeframeRange } from './timeframes';
import { normalizeLandingPagesForOverview, normalizeTrafficSourcesForOverview } from './presentation';
import type { AnalyticsEnv } from './ga4Client';
import type {
  AnalyticsSnapshot,
  AnalyticsTimeframe,
  CategoryPerformanceRow,
  KpiMetric,
  ProductPerformanceRow,
  SegmentPerformanceRow,
  TimeSeriesPoint,
  ZeroViewProductRow,
} from './types';

type BuildSnapshotArgs = {
  env: AnalyticsEnv;
  db: D1Database;
  timeframe: AnalyticsTimeframe;
};

type ProductAccumulator = {
  id: string;
  name: string;
  category: string;
  views: number;
  addToCarts: number;
  purchases: number;
  orders: number;
  isCustomOrder: boolean;
  isCatalogMatched: boolean;
};

type NormalizedProductRow = ProductAccumulator;

const CATEGORY_FALLBACK = 'Uncategorized';
const CUSTOM_ORDERS_CATEGORY = 'Custom Orders';
const UNKNOWN_PRODUCT_NAME = 'Unknown Product';
const CUSTOM_ORDER_ID_PATTERN = /^custom[_-]?order(?:[:/_-]|$)/i;
const CUSTOM_ORDER_TEXT_PATTERN = /\bcustom\s*orders?\b/i;

const eventNamesForTotals = ['view_item', 'add_to_cart', 'begin_checkout', 'generate_lead', 'email_signup'];
const eventNamesForTrends = ['add_to_cart', 'begin_checkout'];
const MIN_BEHAVIOR_EVENT_COUNT_FOR_RELIABLE_MATCHING = 12;
const MIN_BEHAVIOR_MATCH_COVERAGE_RATIO = 0.35;
const CART_LOW_FOLLOW_THROUGH_RATIO = 0.4;

const fmtInt = (value: number): string => new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
const fmtNum = (value: number, digits = 1): string => Number(value || 0).toFixed(digits);
const toRatio = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;

const safePct = (numerator: number, denominator: number): number => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return (numerator / denominator) * 100;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const toDeltaPct = (current: number, previous: number | null | undefined): number | undefined => {
  if (previous === null || previous === undefined) return undefined;
  if (!Number.isFinite(previous) || previous <= 0) return undefined;
  if (!Number.isFinite(current)) return undefined;
  const delta = ((current - previous) / previous) * 100;
  return Number(delta.toFixed(1));
};

const formatAnalyticsShortDate = (isoDate: string): string => {
  const parsed = new Date(`${(isoDate || '').slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(parsed);
};

const formatAnalyticsDateRangeLabel = (range: { startDate: string; endDate: string }): string =>
  `${formatAnalyticsShortDate(range.startDate)}–${formatAnalyticsShortDate(range.endDate)}`;

const normalizeKey = (value: string | null | undefined): string =>
  (value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const looksLikeRawIdentifier = (value: string): boolean => {
  const raw = value.trim();
  if (!raw) return false;
  if (/^(unknown:|prod_|price_|cs_|ch_|cus_)/i.test(raw)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(raw)) return true;
  if (/^[a-z0-9_-]{18,}$/i.test(raw) && !/\s/.test(raw)) return true;
  return false;
};

const toClientSafeProductName = (value: string | null | undefined): string => {
  const trimmed = (value || '').trim();
  if (!trimmed || looksLikeRawIdentifier(trimmed)) return UNKNOWN_PRODUCT_NAME;
  return trimmed;
};

const isCustomOrderLikeProduct = (params: { id: string; name: string; category: string }): boolean => {
  const idRaw = (params.id || '').trim();
  const nameRaw = (params.name || '').trim();
  const categoryRaw = (params.category || '').trim();
  return (
    CUSTOM_ORDER_ID_PATTERN.test(idRaw) ||
    CUSTOM_ORDER_TEXT_PATTERN.test(nameRaw) ||
    CUSTOM_ORDER_TEXT_PATTERN.test(categoryRaw) ||
    normalizeKey(idRaw).includes('custom-order') ||
    normalizeKey(nameRaw).includes('custom-order') ||
    normalizeKey(categoryRaw).includes('custom-order')
  );
};

const toClientSafeCategory = (category: string | null | undefined, isCustomOrder: boolean): string => {
  if (isCustomOrder) return CUSTOM_ORDERS_CATEGORY;
  const trimmed = (category || '').trim();
  if (!trimmed) return CATEGORY_FALLBACK;
  if (normalizeKey(trimmed) === normalizeKey(CUSTOM_ORDERS_CATEGORY)) return CUSTOM_ORDERS_CATEGORY;
  return trimmed;
};

const resolveBehaviorProduct = (
  row: ProductBehaviorRow,
  catalog: CatalogMaps
): { id: string; name: string; category: string; matchedCatalog: boolean; matchedBy: CatalogAliasResolution['matchedBy'] | 'unresolved' } => {
  const itemId = (row.itemId || '').trim();
  const itemName = (row.itemName || '').trim();
  const catalogResolution = resolveCatalogProductAlias(catalog, {
    rawId: itemId,
    rawSlug: itemId,
    rawName: itemName,
  });
  if (catalogResolution) {
    const matched = catalogResolution.product;
    return {
      id: matched.id,
      name: matched.name,
      category: matched.category,
      matchedCatalog: true,
      matchedBy: catalogResolution.matchedBy,
    };
  }
  return {
    id: `unknown:${normalizeKey(itemName || itemId) || 'product'}`,
    name: toClientSafeProductName(itemName),
    category: isCustomOrderLikeProduct({ id: itemId, name: itemName, category: row.itemCategory || '' })
      ? CUSTOM_ORDERS_CATEGORY
      : CATEGORY_FALLBACK,
    matchedCatalog: false,
    matchedBy: 'unresolved',
  };
};

const buildConversionRates = (productViews: number, addToCarts: number, beginCheckout: number, purchases: number) => [
  { label: 'View -> Cart', value: safePct(addToCarts, productViews) },
  { label: 'Cart -> Checkout', value: safePct(beginCheckout, addToCarts) },
  { label: 'Checkout -> Confirmed Order', value: safePct(purchases, beginCheckout) },
];

const buildTrafficInsight = (args: {
  topSource: string | null;
  topSourceShare: number;
  sessionsDelta?: number;
  returningDelta?: number;
}): string => {
  const source = args.topSource || 'Direct';
  if (typeof args.returningDelta === 'number' && args.returningDelta >= 5) {
    return `${source} is driving the most storefront sessions, and returning visitors are rising vs the previous period.`;
  }
  if (typeof args.sessionsDelta === 'number' && args.sessionsDelta < -5) {
    return `Storefront sessions are down vs the previous period; ${source} is still the top acquisition source.`;
  }
  if (args.topSourceShare >= 35) {
    return `${source} is the largest traffic source in this period, with a meaningful share of storefront sessions.`;
  }
  return `Traffic is distributed across multiple sources, with ${source} currently leading storefront acquisition.`;
};

const buildProductInsight = (args: {
  topViewedProducts: ProductPerformanceRow[];
  addedToCartWithoutPurchase: ProductPerformanceRow[];
  customOrdersOrders: number;
  listedProductsOrders: number;
}): string => {
  const topViewed = args.topViewedProducts[0];
  const cartNoPurchase = args.addedToCartWithoutPurchase[0];
  if (!topViewed) {
    return 'Not enough matched product-view data for this period.';
  }
  if (cartNoPurchase) {
    return `${topViewed.name} is getting the most views, while ${cartNoPurchase.name} shows cart intent with weaker purchase follow-through.`;
  }
  if (args.customOrdersOrders > args.listedProductsOrders) {
    return `${topViewed.name} leads product views, and custom orders currently outpace listed-product orders.`;
  }
  return `${topViewed.name} leads product views this period, and listed products are driving most completed orders.`;
};

const buildCustomerInsight = (args: {
  cartToCheckoutRate: number;
  checkoutToPurchaseRate: number;
  emailDelta?: number;
}): string => {
  if (args.checkoutToPurchaseRate < 40) {
    return 'Checkout-to-confirmed-order conversion is the largest drop-off in this period and should be monitored closely.';
  }
  if (args.cartToCheckoutRate < 25) {
    return 'Cart-to-checkout conversion is the largest drop-off in this period and may indicate checkout intent friction.';
  }
  if (typeof args.emailDelta === 'number' && args.emailDelta >= 5) {
    return 'Core funnel conversion is stable and email signups are improving vs the previous period.';
  }
  return 'Core customer-action funnel is stable for this period, with confirmed orders tracking behind checkout starts as expected.';
};

const makeSafeQuery = async <T>(
  label: string,
  fallback: T,
  fn: () => Promise<T>,
  onError?: (error: unknown) => void
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    console.error(`[analytics] ${label} failed`, error);
    onError?.(error);
    return fallback;
  }
};

const toClientSafeBehaviorQueryError = (error: unknown): string => {
  const raw = (error instanceof Error ? error.message : String(error || 'Unknown error')).trim();
  if (!raw) return 'Item-level Product Interest query failed for this period.';
  const withoutCandidateDump = raw.split(' Candidate outcomes:')[0]?.trim() || raw;
  const withoutPrefix = withoutCandidateDump.replace(/^\[analytics\]\[ga4\]\s*/i, '').trim();
  const normalized = withoutPrefix.replace(/\s+/g, ' ');
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
};

const asRoundedPercent = (value: number): number => Number(clamp(value, 0, 100).toFixed(1));

const toProductPerformanceRow = (row: NormalizedProductRow): ProductPerformanceRow => ({
  name: row.name,
  category: row.category || CATEGORY_FALLBACK,
  views: row.views,
  addToCarts: row.addToCarts,
  purchases: row.purchases,
  orders: row.orders,
});

const buildCategoryUniverse = (catalog: CatalogMaps, matchedRows: NormalizedProductRow[]): string[] => {
  const seen = new Set<string>();
  const values: string[] = [];
  const pushCategory = (raw: string | null | undefined) => {
    const category = toClientSafeCategory(raw, false);
    if (!category || category === CUSTOM_ORDERS_CATEGORY || category === CATEGORY_FALLBACK) return;
    const key = normalizeKey(category);
    if (!key || seen.has(key)) return;
    seen.add(key);
    values.push(category);
  };
  catalog.categories.forEach((row) => pushCategory(row.name));
  catalog.products.forEach((row) => pushCategory(row.category));
  matchedRows.forEach((row) => pushCategory(row.category));
  return values;
};

const buildCategoryPerformance = (params: {
  categoryUniverse: string[];
  matchedProductRows: NormalizedProductRow[];
}): CategoryPerformanceRow[] => {
  const map = new Map<string, CategoryPerformanceRow>();
  params.categoryUniverse.forEach((category) => {
    map.set(category, { category, views: 0, purchases: 0, orders: 0 });
  });
  params.matchedProductRows.forEach((row) => {
    const category = toClientSafeCategory(row.category, false);
    if (category === CUSTOM_ORDERS_CATEGORY || category === CATEGORY_FALLBACK) return;
    const existing = map.get(category) || { category, views: 0, purchases: 0, orders: 0 };
    existing.views += row.views;
    existing.purchases += row.purchases;
    existing.orders += row.orders;
    map.set(category, existing);
  });
  return Array.from(map.values()).sort((a, b) => (b.views - a.views) || (b.orders - a.orders) || a.category.localeCompare(b.category));
};

const ensureSeries = (points: TimeSeriesPoint[], fallbackLabel = 'Period'): TimeSeriesPoint[] =>
  points.length ? points : [{ label: fallbackLabel, value: 0 }];

const toCountObject = (counts: Map<string, number>): Record<string, number> =>
  Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));

export const buildAnalyticsSnapshot = async ({ env, db, timeframe }: BuildSnapshotArgs): Promise<AnalyticsSnapshot> => {
  const rangeInfo = buildTimeframeRange(timeframe);
  const currentRange = rangeInfo.current;
  const previousRange = rangeInfo.previous;
  const comparisonRangeLabel = previousRange ? formatAnalyticsDateRangeLabel(previousRange) : '';
  let behaviorQueryFallbackUsed = false;
  let behaviorQueryError: string | null = null;

  const [
    catalog,
    currentTrafficTotals,
    currentReturningUsers,
    currentSourcesRaw,
    currentLandingRaw,
    currentVisitorsByDate,
    currentEventTotals,
    currentEventByDate,
    currentBehaviorRows,
    currentLeadByFormType,
  ] = await Promise.all([
    makeSafeQuery(
      'loadCatalogMaps',
      {
        categories: [],
        products: [],
        listedProducts: [],
        byId: new Map(),
        byStripeProductId: new Map(),
        byStripePriceId: new Map(),
        byNormalizedSlug: new Map(),
        byNormalizedName: new Map(),
      },
      () =>
      loadCatalogMaps(db)
    ),
    makeSafeQuery('ga4.queryTrafficTotals.current', { totalUsers: 0, newUsers: 0, sessions: 0, screenPageViews: 0 }, () =>
      queryTrafficTotals(env, currentRange)
    ),
    makeSafeQuery('ga4.queryReturningVisitors.current', null as number | null, () =>
      queryReturningVisitors(env, currentRange)
    ),
    makeSafeQuery('ga4.queryTrafficSources.current', [] as Array<{ source: string; sessions: number }>, () =>
      queryTrafficSources(env, currentRange)
    ),
    makeSafeQuery('ga4.queryLandingPages.current', [] as Array<{ path: string; sessions: number; engagementRatePct: number }>, () =>
      queryLandingPages(env, currentRange)
    ),
    makeSafeQuery('ga4.queryVisitorsByDate.current', new Map<string, number>(), () => queryVisitorsByDate(env, currentRange)),
    makeSafeQuery('ga4.queryEventTotals.current', new Map<string, number>(), () => queryEventTotals(env, currentRange, eventNamesForTotals)),
    makeSafeQuery('ga4.queryEventByDate.current', new Map<string, Map<string, number>>(), () =>
      queryEventByDate(env, currentRange, eventNamesForTrends)
    ),
    makeSafeQuery(
      'ga4.queryProductBehavior.current',
      [] as ProductBehaviorRow[],
      () => queryProductBehavior(env, currentRange),
      (error) => {
        behaviorQueryFallbackUsed = true;
        behaviorQueryError = toClientSafeBehaviorQueryError(error);
      }
    ),
    makeSafeQuery('ga4.queryGenerateLeadByFormType.current', null as Map<string, number> | null, () =>
      queryGenerateLeadByFormType(env, currentRange)
    ),
  ]);

  const [currentPurchaseMetrics, currentLeadDbFallback] = await Promise.all([
    makeSafeQuery(
      'db.loadPurchaseMetrics.current',
      {
        totalPurchases: 0,
        totalOrders: 0,
        byProduct: new Map(),
        dailyPurchases: new Map(),
        dailyOrders: new Map(),
        hourlyPurchases: new Map(),
        hourlyOrders: new Map(),
      },
      () => loadPurchaseMetrics(db, currentRange, catalog)
    ),
    currentLeadByFormType
      ? Promise.resolve({ message: 0, customOrder: 0 })
      : makeSafeQuery('db.loadMessageTypeCounts.current', { message: 0, customOrder: 0 }, () =>
          loadMessageTypeCounts(db, currentRange)
        ),
  ]);

  const [
    previousTrafficTotals,
    previousReturningUsers,
    previousEventTotals,
    previousLeadByFormType,
    previousPurchaseMetrics,
    previousLeadDbFallback,
  ] = previousRange
    ? await Promise.all([
        makeSafeQuery('ga4.queryTrafficTotals.previous', { totalUsers: 0, newUsers: 0, sessions: 0, screenPageViews: 0 }, () =>
          queryTrafficTotals(env, previousRange)
        ),
        makeSafeQuery('ga4.queryReturningVisitors.previous', null as number | null, () =>
          queryReturningVisitors(env, previousRange)
        ),
        makeSafeQuery('ga4.queryEventTotals.previous', new Map<string, number>(), () =>
          queryEventTotals(env, previousRange, eventNamesForTotals)
        ),
        makeSafeQuery('ga4.queryGenerateLeadByFormType.previous', null as Map<string, number> | null, () =>
          queryGenerateLeadByFormType(env, previousRange)
        ),
        makeSafeQuery(
          'db.loadPurchaseMetrics.previous',
          {
            totalPurchases: 0,
            totalOrders: 0,
            byProduct: new Map(),
            dailyPurchases: new Map(),
            dailyOrders: new Map(),
            hourlyPurchases: new Map(),
            hourlyOrders: new Map(),
          },
          () => loadPurchaseMetrics(db, previousRange, catalog)
        ),
        Promise.resolve({ message: 0, customOrder: 0 }),
      ])
    : [
        null,
        null,
        new Map<string, number>(),
        null,
        {
          totalPurchases: 0,
          totalOrders: 0,
          byProduct: new Map(),
          dailyPurchases: new Map(),
          dailyOrders: new Map(),
          hourlyPurchases: new Map(),
          hourlyOrders: new Map(),
        },
        { message: 0, customOrder: 0 },
      ];

  if (previousRange && !previousLeadByFormType) {
    const fallback = await makeSafeQuery('db.loadMessageTypeCounts.previous', { message: 0, customOrder: 0 }, () =>
      loadMessageTypeCounts(db, previousRange)
    );
    previousLeadDbFallback.message = fallback.message;
    previousLeadDbFallback.customOrder = fallback.customOrder;
  }

  const totalUsers = Math.max(0, Math.round(currentTrafficTotals.totalUsers));
  const newUsers = Math.max(0, Math.round(currentTrafficTotals.newUsers));
  const fallbackReturningUsers = Math.max(0, totalUsers - newUsers);
  const returningUsers =
    currentReturningUsers === null
      ? fallbackReturningUsers
      : Math.min(totalUsers, Math.max(0, Math.round(currentReturningUsers)));
  const sessions = Math.max(0, Math.round(currentTrafficTotals.sessions));
  const pagesPerVisit = sessions > 0 ? currentTrafficTotals.screenPageViews / sessions : 0;

  const prevTotalUsers = previousTrafficTotals ? Math.max(0, Math.round(previousTrafficTotals.totalUsers)) : null;
  const prevNewUsers = previousTrafficTotals ? Math.max(0, Math.round(previousTrafficTotals.newUsers)) : null;
  const prevReturningUsers =
    previousRange && previousTrafficTotals && prevTotalUsers !== null && prevNewUsers !== null
      ? previousReturningUsers === null
        ? Math.max(0, prevTotalUsers - prevNewUsers)
        : Math.min(prevTotalUsers, Math.max(0, Math.round(previousReturningUsers)))
      : null;
  const prevSessions = previousTrafficTotals ? Math.max(0, Math.round(previousTrafficTotals.sessions)) : null;
  const prevPagesPerVisit =
    previousTrafficTotals && Number(previousTrafficTotals.sessions) > 0
      ? Number(previousTrafficTotals.screenPageViews) / Number(previousTrafficTotals.sessions)
      : null;

  const normalizedSources = normalizeTrafficSourcesForOverview(currentSourcesRaw, 6);
  const sourceMix = normalizedSources.map((row) => ({
    name: row.name,
    value: row.value,
    count: row.sessions,
  }));
  const topSource = normalizedSources[0] || null;
  const topSourceShare = sourceMix[0]?.value || 0;

  const visitorsOverTime: TimeSeriesPoint[] = ensureSeries(
    bucketDateSeries(timeframe, currentRange, currentVisitorsByDate).map((point) => ({
      label: point.label,
      value: Math.round(point.value),
      rangeStart: point.rangeStart,
      rangeEnd: point.rangeEnd,
    })),
    'Period'
  );

  const trafficLandingPages = normalizeLandingPagesForOverview(currentLandingRaw, catalog, 5);

  const trafficKpis: KpiMetric[] = [
    { label: 'Total Visitors', value: fmtInt(totalUsers), deltaPct: toDeltaPct(totalUsers, prevTotalUsers) },
    { label: 'New Visitors', value: fmtInt(newUsers), deltaPct: toDeltaPct(newUsers, prevNewUsers) },
    { label: 'Returning Visitors', value: fmtInt(returningUsers), deltaPct: toDeltaPct(returningUsers, prevReturningUsers) },
    { label: 'Sessions', value: fmtInt(sessions), deltaPct: toDeltaPct(sessions, prevSessions) },
    {
      label: 'Top Source',
      value: topSource?.name || 'N/A',
      helper: topSource ? `${fmtInt(topSource.sessions)} sessions` : 'No source data',
    },
    {
      label: 'Avg. Pages per Visit',
      value: fmtNum(pagesPerVisit, 1),
      deltaPct: toDeltaPct(pagesPerVisit, prevPagesPerVisit),
    },
  ];

  const productAggregate = new Map<string, ProductAccumulator>();
  let matchedBehaviorRows = 0;
  let unmatchedBehaviorRows = 0;
  const behaviorRowsByEvent = new Map<string, number>();
  const behaviorEventCountByEvent = new Map<string, number>();
  const matchedBehaviorRowsByEvent = new Map<string, number>();
  const matchedBehaviorEventCountByEvent = new Map<string, number>();
  const unmatchedBehaviorRowsByEvent = new Map<string, number>();
  const unmatchedBehaviorEventCountByEvent = new Map<string, number>();
  const behaviorRowsByMatchType = new Map<string, number>();

  currentBehaviorRows.forEach((row) => {
    const viewEvents = Math.max(0, Math.round(row.itemViewEvents));
    const addToCartEvents = Math.max(0, Math.round(row.itemsAddedToCart));

    if (viewEvents > 0) {
      behaviorRowsByEvent.set('view_item', (behaviorRowsByEvent.get('view_item') || 0) + 1);
      behaviorEventCountByEvent.set('view_item', (behaviorEventCountByEvent.get('view_item') || 0) + viewEvents);
    }
    if (addToCartEvents > 0) {
      behaviorRowsByEvent.set('add_to_cart', (behaviorRowsByEvent.get('add_to_cart') || 0) + 1);
      behaviorEventCountByEvent.set('add_to_cart', (behaviorEventCountByEvent.get('add_to_cart') || 0) + addToCartEvents);
    }

    const canonical = resolveBehaviorProduct(row, catalog);
    const matchedCatalog = canonical.matchedCatalog;
    const isCustomOrder = isCustomOrderLikeProduct({
      id: canonical.id,
      name: canonical.name,
      category: canonical.category,
    });
    if (matchedCatalog) {
      matchedBehaviorRows += 1;
      if (viewEvents > 0) {
        matchedBehaviorRowsByEvent.set('view_item', (matchedBehaviorRowsByEvent.get('view_item') || 0) + 1);
        matchedBehaviorEventCountByEvent.set(
          'view_item',
          (matchedBehaviorEventCountByEvent.get('view_item') || 0) + viewEvents
        );
      }
      if (addToCartEvents > 0) {
        matchedBehaviorRowsByEvent.set('add_to_cart', (matchedBehaviorRowsByEvent.get('add_to_cart') || 0) + 1);
        matchedBehaviorEventCountByEvent.set(
          'add_to_cart',
          (matchedBehaviorEventCountByEvent.get('add_to_cart') || 0) + addToCartEvents
        );
      }
    } else {
      unmatchedBehaviorRows += 1;
      if (viewEvents > 0) {
        unmatchedBehaviorRowsByEvent.set('view_item', (unmatchedBehaviorRowsByEvent.get('view_item') || 0) + 1);
        unmatchedBehaviorEventCountByEvent.set(
          'view_item',
          (unmatchedBehaviorEventCountByEvent.get('view_item') || 0) + viewEvents
        );
      }
      if (addToCartEvents > 0) {
        unmatchedBehaviorRowsByEvent.set('add_to_cart', (unmatchedBehaviorRowsByEvent.get('add_to_cart') || 0) + 1);
        unmatchedBehaviorEventCountByEvent.set(
          'add_to_cart',
          (unmatchedBehaviorEventCountByEvent.get('add_to_cart') || 0) + addToCartEvents
        );
      }
    }
    behaviorRowsByMatchType.set(canonical.matchedBy, (behaviorRowsByMatchType.get(canonical.matchedBy) || 0) + 1);
    const existing = productAggregate.get(canonical.id) || {
      id: canonical.id,
      name: isCustomOrder ? 'Custom Order' : toClientSafeProductName(canonical.name),
      category: toClientSafeCategory(canonical.category, isCustomOrder),
      views: 0,
      addToCarts: 0,
      purchases: 0,
      orders: 0,
      isCustomOrder,
      isCatalogMatched: matchedCatalog,
    };

    const nextName = isCustomOrder ? 'Custom Order' : toClientSafeProductName(canonical.name);
    if (existing.name === UNKNOWN_PRODUCT_NAME && nextName !== UNKNOWN_PRODUCT_NAME) {
      existing.name = nextName;
    }
    existing.isCustomOrder = existing.isCustomOrder || isCustomOrder;
    existing.isCatalogMatched = existing.isCatalogMatched || matchedCatalog;
    if (existing.isCustomOrder) {
      existing.category = CUSTOM_ORDERS_CATEGORY;
    } else if (existing.category === CATEGORY_FALLBACK) {
      existing.category = toClientSafeCategory(canonical.category, false);
    }

    existing.views += viewEvents;
    existing.addToCarts += addToCartEvents;
    productAggregate.set(canonical.id, existing);
  });

  currentPurchaseMetrics.byProduct.forEach((purchaseRow, canonicalProductId) => {
    const matchedCatalog = catalog.byId.has(canonicalProductId);
    const isCustomOrder = isCustomOrderLikeProduct({
      id: canonicalProductId,
      name: purchaseRow.name,
      category: purchaseRow.category,
    });
    const existing = productAggregate.get(canonicalProductId) || {
      id: canonicalProductId,
      name: isCustomOrder ? 'Custom Order' : toClientSafeProductName(purchaseRow.name),
      category: toClientSafeCategory(purchaseRow.category, isCustomOrder),
      views: 0,
      addToCarts: 0,
      purchases: 0,
      orders: 0,
      isCustomOrder,
      isCatalogMatched: matchedCatalog,
    };
    existing.purchases += Math.round(purchaseRow.purchases);
    existing.orders += Math.round(purchaseRow.orders);

    const nextName = isCustomOrder ? 'Custom Order' : toClientSafeProductName(purchaseRow.name);
    if (existing.name === UNKNOWN_PRODUCT_NAME && nextName !== UNKNOWN_PRODUCT_NAME) {
      existing.name = nextName;
    }
    existing.isCustomOrder = existing.isCustomOrder || isCustomOrder;
    existing.isCatalogMatched = existing.isCatalogMatched || matchedCatalog;
    if (existing.isCustomOrder) {
      existing.category = CUSTOM_ORDERS_CATEGORY;
    } else if (existing.category === CATEGORY_FALLBACK) {
      existing.category = toClientSafeCategory(purchaseRow.category, false);
    }

    productAggregate.set(canonicalProductId, existing);
  });

  if (unmatchedBehaviorRows > 0) {
    console.warn('[analytics] unmatched GA4 product rows', {
      totalBehaviorRows: currentBehaviorRows.length,
      matchedBehaviorRows,
      unmatchedBehaviorRows,
      unmatchedBehaviorRowsByEvent: toCountObject(unmatchedBehaviorRowsByEvent),
    });
  }

  const allProductRows = Array.from(productAggregate.values())
    .map((row) => ({
      id: row.id,
      name: row.isCustomOrder ? 'Custom Order' : toClientSafeProductName(row.name),
      category: toClientSafeCategory(row.category, row.isCustomOrder),
      isCustomOrder: row.isCustomOrder,
      isCatalogMatched: row.isCatalogMatched,
      views: Math.max(0, Math.round(row.views)),
      addToCarts: Math.max(0, Math.round(row.addToCarts)),
      purchases: Math.max(0, Math.round(row.purchases)),
      orders: Math.max(0, Math.round(row.orders)),
    }))
    .sort((a, b) => (b.views - a.views) || (b.addToCarts - a.addToCarts) || (b.purchases - a.purchases));

  const productSpecificRows = allProductRows.filter((row) => !row.isCustomOrder && row.isCatalogMatched);
  const behaviorQualifiedRows = productSpecificRows.filter((row) => row.views > 0 || row.addToCarts > 0);
  const matchedViewRows = productSpecificRows.filter((row) => row.views > 0);
  const matchedCartRows = productSpecificRows.filter((row) => row.addToCarts > 0);
  const unresolvedRows = allProductRows.filter((row) => !row.isCatalogMatched && !row.isCustomOrder);

  const totalViewEventCount = behaviorEventCountByEvent.get('view_item') || 0;
  const matchedViewEventCount = matchedBehaviorEventCountByEvent.get('view_item') || 0;
  const totalCartEventCount = behaviorEventCountByEvent.get('add_to_cart') || 0;
  const matchedCartEventCount = matchedBehaviorEventCountByEvent.get('add_to_cart') || 0;
  const viewMatchCoverageRatio = toRatio(matchedViewEventCount, totalViewEventCount);
  const cartMatchCoverageRatio = toRatio(matchedCartEventCount, totalCartEventCount);
  const viewMatchCoveragePct = asRoundedPercent(viewMatchCoverageRatio * 100);
  const cartMatchCoveragePct = asRoundedPercent(cartMatchCoverageRatio * 100);
  const viewCoverageLimited =
    behaviorQueryFallbackUsed ||
    (totalViewEventCount > 0 &&
      (matchedViewEventCount <= 0 ||
        (totalViewEventCount >= MIN_BEHAVIOR_EVENT_COUNT_FOR_RELIABLE_MATCHING &&
          viewMatchCoverageRatio < MIN_BEHAVIOR_MATCH_COVERAGE_RATIO)));
  const cartCoverageLimited =
    behaviorQueryFallbackUsed ||
    (totalCartEventCount > 0 &&
      (matchedCartEventCount <= 0 ||
        (totalCartEventCount >= MIN_BEHAVIOR_EVENT_COUNT_FOR_RELIABLE_MATCHING &&
          cartMatchCoverageRatio < MIN_BEHAVIOR_MATCH_COVERAGE_RATIO)));

  const categoryUniverse = buildCategoryUniverse(catalog, productSpecificRows);
  const categoryPerformance = buildCategoryPerformance({
    categoryUniverse,
    matchedProductRows: productSpecificRows,
  });

  const topViewedProducts: ProductPerformanceRow[] = viewCoverageLimited
    ? []
    : [...matchedViewRows]
        .sort((a, b) => (b.views - a.views) || (b.addToCarts - a.addToCarts) || (b.orders - a.orders))
        .slice(0, 12)
        .map(toProductPerformanceRow);

  const cartIntentProducts = cartCoverageLimited
    ? []
    : [...matchedCartRows]
        .filter((row) => {
          if (row.addToCarts <= 0) return false;
          if (row.orders <= 0 || row.purchases <= 0) return true;
          return toRatio(row.orders, row.addToCarts) < CART_LOW_FOLLOW_THROUGH_RATIO;
        })
        .sort((a, b) => {
          const gapA = a.addToCarts - a.orders;
          const gapB = b.addToCarts - b.orders;
          return (gapB - gapA) || (b.addToCarts - a.addToCarts) || a.name.localeCompare(b.name);
        });

  const addedToCartWithoutPurchase: ProductPerformanceRow[] = cartIntentProducts
    .slice(0, 12)
    .map(toProductPerformanceRow);

  const rowsByCanonicalId = new Map(productSpecificRows.map((row) => [row.id, row]));
  const productsWithNoViews: ZeroViewProductRow[] = viewCoverageLimited
    ? []
    : catalog.listedProducts
        .map((product) => {
          const existing = rowsByCanonicalId.get(product.id);
          return {
            name: toClientSafeProductName(product.name),
            category: toClientSafeCategory(product.category, false),
            views: Math.max(0, Math.round(existing?.views || 0)),
            addToCarts: Math.max(0, Math.round(existing?.addToCarts || 0)),
            purchases: Math.max(0, Math.round(existing?.purchases || 0)),
            orders: Math.max(0, Math.round(existing?.orders || 0)),
          };
        })
        .filter((row) => row.views <= 0)
        .sort((a, b) => (b.addToCarts - a.addToCarts) || (b.orders - a.orders) || a.name.localeCompare(b.name))
        .slice(0, 24);

  const customOrderTotals = allProductRows
    .filter((row) => row.isCustomOrder)
    .reduce(
      (acc, row) => ({
        purchases: acc.purchases + row.purchases,
        orders: acc.orders + row.orders,
      }),
      { purchases: 0, orders: 0 }
    );
  const listedProductTotals = productSpecificRows.reduce(
    (acc, row) => ({
      purchases: acc.purchases + row.purchases,
      orders: acc.orders + row.orders,
    }),
    { purchases: 0, orders: 0 }
  );
  const customOrdersVsListed: SegmentPerformanceRow[] = [
    {
      name: CUSTOM_ORDERS_CATEGORY,
      purchases: customOrderTotals.purchases,
      orders: customOrderTotals.orders,
    },
    {
      name: 'Listed Products',
      purchases: listedProductTotals.purchases,
      orders: listedProductTotals.orders,
    },
  ];

  const topViewedModuleState =
    behaviorQueryFallbackUsed
      ? {
          state: 'degraded' as const,
          message: 'Item-level behavior query was unavailable for this period.',
        }
      : viewCoverageLimited
        ? {
            state: 'degraded' as const,
            message: 'Product-level view matching is limited for this period.',
          }
        : topViewedProducts.length
          ? {
              state: 'ok' as const,
              message: 'Matched product views are available for this period.',
            }
          : {
              state: 'empty' as const,
              message:
                totalViewEventCount > 0
                  ? 'Not enough matched product-view data for this period.'
                  : 'No product-view activity captured for this period.',
            };

  const productsWithNoViewsModuleState =
    behaviorQueryFallbackUsed
      ? {
          state: 'degraded' as const,
          message: 'Item-level behavior query was unavailable for this period.',
        }
      : viewCoverageLimited
        ? {
            state: 'degraded' as const,
            message: 'Product-level view matching is limited for this period.',
          }
        : productsWithNoViews.length
          ? {
              state: 'ok' as const,
              message: 'Listed products with no reliable matched views are shown below.',
            }
          : {
              state: 'empty' as const,
              message: 'All listed products with reliable matched data have at least one view this period.',
            };

  const addedToCartModuleState =
    behaviorQueryFallbackUsed
      ? {
          state: 'degraded' as const,
          message: 'Item-level behavior query was unavailable for this period.',
        }
      : cartCoverageLimited
        ? {
            state: 'degraded' as const,
            message: 'Not enough matched cart-intent data for this period.',
          }
        : addedToCartWithoutPurchase.length
          ? {
              state: 'ok' as const,
              message: 'Matched cart-intent products with low purchase follow-through are shown below.',
            }
          : {
              state: 'empty' as const,
              message:
                totalCartEventCount > 0
                  ? 'Matched cart-intent products converted to orders in this period.'
                  : 'No add-to-cart activity captured for this period.',
            };

  const categoryPerformanceModuleState =
    behaviorQueryFallbackUsed
      ? {
          state: 'degraded' as const,
          message:
            'Item-level behavior query was unavailable for this period. Orders are complete; category views are unavailable.',
        }
      : viewCoverageLimited && totalViewEventCount > 0
        ? {
            state: 'degraded' as const,
            message:
              'View counts reflect matched product activity only for this period. Orders remain complete confirmed-order totals.',
          }
        : totalViewEventCount <= 0
          ? {
              state: 'empty' as const,
              message: 'No product-view activity was captured for this period; orders are still shown from confirmed orders.',
            }
          : {
              state: 'ok' as const,
              message: 'Category views and orders are available for this period.',
            };

  const productInterestModuleStates = {
    topViewedProducts: topViewedModuleState,
    productsWithNoViews: productsWithNoViewsModuleState,
    addedToCartWithoutPurchase: addedToCartModuleState,
    categoryPerformance: categoryPerformanceModuleState,
  };

  const topViewed = topViewedProducts[0] || null;
  const topAdded = cartCoverageLimited
    ? null
    : [...matchedCartRows]
        .sort((a, b) => (b.addToCarts - a.addToCarts) || (b.views - a.views) || (b.orders - a.orders))
        .map(toProductPerformanceRow)[0] || null;

  const productInterestKpiCards = [
    {
      key: 'topViewedProduct' as const,
      title: 'Top Viewed Product',
      status: topViewedModuleState.state,
      productName: topViewed ? topViewed.name : null,
      metricValue: topViewed ? topViewed.views : null,
      metricLabel: 'views',
      message: topViewed ? `${fmtInt(topViewed.views)} matched views` : topViewedModuleState.message,
      coverageNote:
        topViewedModuleState.state === 'degraded' && totalViewEventCount > 0
          ? `Matched product-view coverage: ${fmtNum(viewMatchCoveragePct, 1)}%`
          : undefined,
    },
    {
      key: 'mostAddedToCartProduct' as const,
      title: 'Most Added-to-Cart Product',
      status: addedToCartModuleState.state,
      productName: topAdded ? topAdded.name : null,
      metricValue: topAdded ? topAdded.addToCarts : null,
      metricLabel: 'adds to cart',
      message: topAdded ? `${fmtInt(topAdded.addToCarts)} matched adds to cart` : addedToCartModuleState.message,
      coverageNote:
        addedToCartModuleState.state === 'degraded' && totalCartEventCount > 0
          ? `Matched cart-intent coverage: ${fmtNum(cartMatchCoveragePct, 1)}%`
          : undefined,
    },
  ];

  const productInterestModulesSummary = {
    topViewedProducts: topViewedProducts.length,
    zeroViewProducts: productsWithNoViews.length,
    addedToCartWithoutPurchase: addedToCartWithoutPurchase.length,
    categoryRows: categoryPerformance.length,
    customOrdersOrders: customOrderTotals.orders,
    listedProductsOrders: listedProductTotals.orders,
    viewCoverageLimited,
    cartCoverageLimited,
  };

  console.info('[analytics][product-interest] normalization-summary', {
    behaviorQueryFallbackUsed,
    behaviorQueryError,
    totalBehaviorRows: currentBehaviorRows.length,
    matchedBehaviorRows,
    unmatchedBehaviorRows,
    behaviorRowsByMatchType: toCountObject(behaviorRowsByMatchType),
    behaviorRowsByEvent: toCountObject(behaviorRowsByEvent),
    behaviorEventCountByEvent: toCountObject(behaviorEventCountByEvent),
    matchedBehaviorRowsByEvent: toCountObject(matchedBehaviorRowsByEvent),
    matchedBehaviorEventCountByEvent: toCountObject(matchedBehaviorEventCountByEvent),
    unmatchedBehaviorRowsByEvent: toCountObject(unmatchedBehaviorRowsByEvent),
    unmatchedBehaviorEventCountByEvent: toCountObject(unmatchedBehaviorEventCountByEvent),
    totalViewEventCount,
    matchedViewEventCount,
    viewMatchCoverageRatio,
    totalCartEventCount,
    matchedCartEventCount,
    cartMatchCoverageRatio,
    totalRows: allProductRows.length,
    productSpecificRows: productSpecificRows.length,
    matchedViewRows: matchedViewRows.length,
    matchedCartRows: matchedCartRows.length,
    customOrderRows: allProductRows.filter((row) => row.isCustomOrder).length,
    unresolvedRows: unresolvedRows.length,
    categoryUniverse: categoryUniverse.length,
    productInterestModules: productInterestModulesSummary,
  });

  const totalPurchases = currentPurchaseMetrics.totalPurchases;
  const totalConfirmedOrders = currentPurchaseMetrics.totalOrders;
  const prevPurchases = previousPurchaseMetrics.totalPurchases;

  const viewItemCount = currentEventTotals.get('view_item') || 0;
  const addToCartCount = currentEventTotals.get('add_to_cart') || 0;
  const beginCheckoutCount = currentEventTotals.get('begin_checkout') || 0;
  const emailSignupCount = currentEventTotals.get('email_signup') || 0;
  const totalGenerateLeadCount = currentEventTotals.get('generate_lead') || 0;

  const prevAddToCartCount = previousEventTotals.get('add_to_cart') || 0;
  const prevBeginCheckoutCount = previousEventTotals.get('begin_checkout') || 0;
  const prevEmailSignupCount = previousEventTotals.get('email_signup') || 0;
  const prevGenerateLeadCount = previousEventTotals.get('generate_lead') || 0;

  let contactCount = 0;
  let customOrderCount = 0;
  let previousContactCount = 0;
  let previousCustomOrderCount = 0;

  if (currentLeadByFormType) {
    const custom =
      (currentLeadByFormType.get('custom_order') || 0) +
      (currentLeadByFormType.get('custom-order') || 0);
    const message =
      (currentLeadByFormType.get('message') || 0) +
      (currentLeadByFormType.get('contact') || 0);
    customOrderCount = Math.max(0, custom);
    contactCount = Math.max(0, message || Math.max(0, totalGenerateLeadCount - customOrderCount));
  } else {
    customOrderCount = currentLeadDbFallback.customOrder;
    contactCount = currentLeadDbFallback.message;
  }

  if (previousRange) {
    if (previousLeadByFormType) {
      const custom =
        (previousLeadByFormType.get('custom_order') || 0) +
        (previousLeadByFormType.get('custom-order') || 0);
      const message =
        (previousLeadByFormType.get('message') || 0) +
        (previousLeadByFormType.get('contact') || 0);
      previousCustomOrderCount = Math.max(0, custom);
      previousContactCount = Math.max(0, message || Math.max(0, prevGenerateLeadCount - previousCustomOrderCount));
    } else {
      previousCustomOrderCount = previousLeadDbFallback.customOrder;
      previousContactCount = previousLeadDbFallback.message;
    }
  }

  const conversionRates = buildConversionRates(viewItemCount, addToCartCount, beginCheckoutCount, totalConfirmedOrders);

  const addToCartByDate = new Map<string, number>();
  const beginCheckoutByDate = new Map<string, number>();
  currentEventByDate.forEach((eventMap, date) => {
    addToCartByDate.set(date, eventMap.get('add_to_cart') || 0);
    beginCheckoutByDate.set(date, eventMap.get('begin_checkout') || 0);
  });

  const actionTrendPoints: TimeSeriesPoint[] = ensureSeries(
    (() => {
      const addBuckets = bucketDateSeries(timeframe, currentRange, addToCartByDate);
      const checkoutBuckets = bucketDateSeries(timeframe, currentRange, beginCheckoutByDate);
      const purchaseBuckets = bucketDateSeries(timeframe, currentRange, currentPurchaseMetrics.dailyOrders);
      return addBuckets.map((point, index) => ({
        label: point.label,
        value: point.value,
        secondaryValue: checkoutBuckets[index]?.value || 0,
        tertiaryValue: purchaseBuckets[index]?.value || 0,
        rangeStart: point.rangeStart,
        rangeEnd: point.rangeEnd,
      }));
    })(),
    'Period'
  );

  const customerActionKpis: KpiMetric[] = [
    { label: 'Add to Carts', value: fmtInt(addToCartCount), deltaPct: toDeltaPct(addToCartCount, prevAddToCartCount) },
    {
      label: 'Checkout Starts',
      value: fmtInt(beginCheckoutCount),
      deltaPct: toDeltaPct(beginCheckoutCount, prevBeginCheckoutCount),
    },
    {
      label: 'Purchases',
      value: fmtInt(totalPurchases),
      helper: `${fmtInt(totalConfirmedOrders)} confirmed orders`,
      deltaPct: toDeltaPct(totalPurchases, prevPurchases),
    },
    {
      label: 'Contact Form Submissions',
      value: fmtInt(contactCount),
      deltaPct: toDeltaPct(contactCount, previousRange ? previousContactCount : null),
    },
    {
      label: 'Custom Order Requests',
      value: fmtInt(customOrderCount),
      deltaPct: toDeltaPct(customOrderCount, previousRange ? previousCustomOrderCount : null),
    },
    {
      label: 'Email Signups',
      value: fmtInt(emailSignupCount),
      deltaPct: toDeltaPct(emailSignupCount, prevEmailSignupCount),
    },
  ];

  const trafficInsight = buildTrafficInsight({
    topSource: topSource?.name || null,
    topSourceShare,
    sessionsDelta: toDeltaPct(sessions, prevSessions),
    returningDelta: toDeltaPct(returningUsers, prevReturningUsers),
  });

  const productInsight = buildProductInsight({
    topViewedProducts,
    addedToCartWithoutPurchase,
    customOrdersOrders: customOrderTotals.orders,
    listedProductsOrders: listedProductTotals.orders,
  });
  const customerInsight = buildCustomerInsight({
    cartToCheckoutRate: conversionRates[1]?.value || 0,
    checkoutToPurchaseRate: conversionRates[2]?.value || 0,
    emailDelta: toDeltaPct(emailSignupCount, prevEmailSignupCount),
  });

  return {
    timeframe: {
      ...rangeInfo.timeframe,
      compareLabel: comparisonRangeLabel || rangeInfo.timeframe.compareLabel,
    },
    trafficOverview: {
      kpis: trafficKpis,
      visitorsOverTime,
      sourceMix,
      landingPages: trafficLandingPages,
      newVisitors: newUsers,
      returningVisitors: returningUsers,
      insight: trafficInsight,
    },
    productInterest: {
      kpiCards: productInterestKpiCards,
      topViewedProducts,
      productsWithNoViews,
      categoryPerformance: categoryPerformance.slice(0, 12),
      customOrdersVsListed,
      addedToCartWithoutPurchase,
      moduleStates: productInterestModuleStates,
      coverage: {
        viewCoverageLimited,
        cartCoverageLimited,
        behaviorQueryFallbackUsed,
        behaviorQueryError,
        matchedViewEventCount,
        totalViewEventCount,
        viewMatchCoveragePct,
        matchedCartEventCount,
        totalCartEventCount,
        cartMatchCoveragePct,
      },
      insight: productInsight,
    },
    customerActions: {
      kpis: customerActionKpis,
      funnel: [
        { label: 'Product Views', count: viewItemCount },
        { label: 'Add to Cart', count: addToCartCount, conversionPctFromPrevious: conversionRates[0].value },
        { label: 'Begin Checkout', count: beginCheckoutCount, conversionPctFromPrevious: conversionRates[1].value },
        { label: 'Confirmed Orders', count: totalConfirmedOrders, conversionPctFromPrevious: conversionRates[2].value },
      ],
      leadActions: [
        { name: 'Contact Form Submissions', value: contactCount },
        { name: 'Custom Order Requests', value: customOrderCount },
        { name: 'Email Signups', value: emailSignupCount },
      ],
      conversionRates: conversionRates.map((row) => ({ label: row.label, value: asRoundedPercent(row.value) })),
      actionsOverTime: actionTrendPoints,
      insight: customerInsight,
    },
    diagnostics: {
      productIdentity: {
        behaviorQuerySucceeded: !behaviorQueryFallbackUsed,
        behaviorQueryFallbackUsed,
        behaviorQueryError,
        totalBehaviorRows: currentBehaviorRows.length,
        matchedBehaviorRows,
        unmatchedBehaviorRows,
        behaviorRowsByEvent: toCountObject(behaviorRowsByEvent),
        behaviorEventCountByEvent: toCountObject(behaviorEventCountByEvent),
        matchedBehaviorRowsByEvent: toCountObject(matchedBehaviorRowsByEvent),
        matchedBehaviorEventCountByEvent: toCountObject(matchedBehaviorEventCountByEvent),
        unmatchedBehaviorRowsByEvent: toCountObject(unmatchedBehaviorRowsByEvent),
        unmatchedBehaviorEventCountByEvent: toCountObject(unmatchedBehaviorEventCountByEvent),
        behaviorRowsByMatchType: toCountObject(behaviorRowsByMatchType),
        matchedViewEventCount,
        totalViewEventCount,
        viewMatchCoveragePct,
        matchedCartEventCount,
        totalCartEventCount,
        cartMatchCoveragePct,
        unresolvedCatalogRows: unresolvedRows.length,
        productSpecificRows: productSpecificRows.length,
        behaviorQualifiedRows: behaviorQualifiedRows.length,
        viewQualifiedRows: matchedViewRows.length,
      },
      productInterestModules: productInterestModulesSummary,
    },
  };
};
