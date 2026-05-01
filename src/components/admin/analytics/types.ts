export type AnalyticsTabKey = 'trafficOverview' | 'productInterest' | 'customerActions';

export type AnalyticsDisplayMode = 'visual' | 'numbers';

export type AnalyticsTimeframe =
  | 'last7Days'
  | 'last30Days'
  | 'last90Days'
  | 'yearToDate'
  | 'last12Months'
  | 'lifetime';

export type TimeframeMeta = {
  key: AnalyticsTimeframe;
  label: string;
  compareLabel: string;
  multiplier: number;
  hasComparison?: boolean;
};

export type KpiMetric = {
  label: string;
  value: string;
  helper?: string;
  deltaPct?: number;
};

export type TimeSeriesPoint = {
  label: string;
  value: number;
  secondaryValue?: number;
  tertiaryValue?: number;
  rangeStart?: string;
  rangeEnd?: string;
  hourStart?: number;
  hourEnd?: number;
};

export type NameValueDatum = {
  name: string;
  value: number;
  count?: number;
};

export type LandingPageDatum = {
  path: string;
  visitors: number;
  engagementPct: number;
};

export type ProductPerformanceRow = {
  name: string;
  category: string;
  views: number;
  addToCarts: number;
  purchases: number;
  orders: number;
};

export type ProductInterestKpiCard = {
  key: 'topViewedProduct' | 'mostAddedToCartProduct';
  title: string;
  status: 'ok' | 'empty' | 'degraded';
  productName: string | null;
  metricValue: number | null;
  metricLabel: string;
  message: string;
  coverageNote?: string;
};

export type LowConversionRow = {
  name: string;
  views: number;
  addToCarts: number;
  purchases: number;
  conversionPct: number;
};

export type CategoryPerformanceRow = {
  category: string;
  views: number;
  purchases: number;
  orders: number;
};

export type ZeroViewProductRow = {
  name: string;
  category: string;
  views: number;
  addToCarts: number;
  purchases: number;
  orders: number;
};

export type SegmentPerformanceRow = {
  name: string;
  purchases: number;
  orders: number;
};

export type ProductInterestModuleStatus = {
  state: 'ok' | 'empty' | 'degraded';
  message: string;
};

export type ProductInterestModuleStates = {
  topViewedProducts: ProductInterestModuleStatus;
  productsWithNoViews: ProductInterestModuleStatus;
  addedToCartWithoutPurchase: ProductInterestModuleStatus;
  categoryPerformance: ProductInterestModuleStatus;
};

export type ProductInterestCoverageSummary = {
  viewCoverageLimited: boolean;
  cartCoverageLimited: boolean;
  behaviorQueryFallbackUsed: boolean;
  behaviorQueryError?: string | null;
  matchedViewEventCount: number;
  totalViewEventCount: number;
  viewMatchCoveragePct: number;
  matchedCartEventCount: number;
  totalCartEventCount: number;
  cartMatchCoveragePct: number;
};

export type FunnelStep = {
  label: string;
  count: number;
  conversionPctFromPrevious?: number;
};

export type TrafficOverviewData = {
  kpis: KpiMetric[];
  visitorsOverTime: TimeSeriesPoint[];
  sourceMix: NameValueDatum[];
  landingPages: LandingPageDatum[];
  newVisitors: number;
  returningVisitors: number;
  insight: string;
};

export type ProductInterestData = {
  kpiCards: ProductInterestKpiCard[];
  topViewedProducts: ProductPerformanceRow[];
  productsWithNoViews: ZeroViewProductRow[];
  categoryPerformance: CategoryPerformanceRow[];
  customOrdersVsListed: SegmentPerformanceRow[];
  addedToCartWithoutPurchase: ProductPerformanceRow[];
  moduleStates: ProductInterestModuleStates;
  coverage: ProductInterestCoverageSummary;
  insight: string;
};

export type CustomerActionsData = {
  kpis: KpiMetric[];
  funnel: FunnelStep[];
  leadActions: Array<{ name: string; value: number }>;
  conversionRates: Array<{ label: string; value: number }>;
  actionsOverTime: TimeSeriesPoint[];
  insight: string;
};

export type AnalyticsDiagnostics = {
  productIdentity?: {
    behaviorQuerySucceeded?: boolean;
    behaviorQueryFallbackUsed?: boolean;
    behaviorQueryError?: string | null;
    totalBehaviorRows: number;
    matchedBehaviorRows: number;
    unmatchedBehaviorRows: number;
    behaviorRowsByEvent: Record<string, number>;
    behaviorEventCountByEvent?: Record<string, number>;
    matchedBehaviorRowsByEvent: Record<string, number>;
    matchedBehaviorEventCountByEvent?: Record<string, number>;
    unmatchedBehaviorRowsByEvent: Record<string, number>;
    unmatchedBehaviorEventCountByEvent?: Record<string, number>;
    behaviorRowsByMatchType: Record<string, number>;
    matchedViewEventCount?: number;
    totalViewEventCount?: number;
    viewMatchCoveragePct?: number;
    matchedCartEventCount?: number;
    totalCartEventCount?: number;
    cartMatchCoveragePct?: number;
    unresolvedCatalogRows: number;
    productSpecificRows: number;
    behaviorQualifiedRows: number;
    viewQualifiedRows: number;
  };
  productInterestModules?: {
    topViewedProducts: number;
    zeroViewProducts: number;
    addedToCartWithoutPurchase: number;
    categoryRows: number;
    customOrdersOrders: number;
    listedProductsOrders: number;
    viewCoverageLimited?: boolean;
    cartCoverageLimited?: boolean;
  };
};

export type AnalyticsSnapshot = {
  timeframe: TimeframeMeta;
  trafficOverview: TrafficOverviewData;
  productInterest: ProductInterestData;
  customerActions: CustomerActionsData;
  diagnostics?: AnalyticsDiagnostics;
};
