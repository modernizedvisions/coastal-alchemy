import {
  checkGa4ReportCompatibility,
  makeStorefrontPageFilter,
  runGa4Report,
  safeNumber,
  type AnalyticsEnv,
} from './ga4Client';
import type { AnalyticsDateRange, AnalyticsTimeframe } from './types';

type Ga4Row = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

const asRows = (response: { rows?: Ga4Row[] } | null | undefined): Ga4Row[] => response?.rows || [];

const dim = (row: Ga4Row, index: number): string => row.dimensionValues?.[index]?.value || '';
const metric = (row: Ga4Row, index: number): number => safeNumber(row.metricValues?.[index]?.value);

const buildEventInListFilter = (eventNames: string[]): Record<string, unknown> => ({
  filter: {
    fieldName: 'eventName',
    inListFilter: {
      values: eventNames,
      caseSensitive: false,
    },
  },
});

const withStorefrontPageFilter = (
  baseFilter: Record<string, unknown> | null,
  fieldName = 'pagePath'
): Record<string, unknown> => {
  const pageFilter = makeStorefrontPageFilter(fieldName);
  if (!baseFilter) return pageFilter;
  return {
    andGroup: {
      expressions: [baseFilter, pageFilter],
    },
  };
};

const runReportWithFilterFallback = async (
  env: AnalyticsEnv,
  request: Record<string, unknown>,
  filterFieldName: string
) => {
  try {
    return await runGa4Report(env, {
      ...request,
      dimensionFilter: withStorefrontPageFilter((request.dimensionFilter as Record<string, unknown>) || null, filterFieldName),
    } as any);
  } catch (error) {
    console.warn('[analytics][ga4] storefront filter fallback triggered', {
      filterFieldName,
      error: error instanceof Error ? error.message : String(error),
    });
    return runGa4Report(env, request as any);
  }
};

export const queryTrafficTotals = async (env: AnalyticsEnv, range: AnalyticsDateRange) => {
  const response = await runReportWithFilterFallback(
    env,
    {
      dateRanges: [range],
      metrics: [
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
      ],
    },
    'pagePath'
  );
  const row = asRows(response)[0];
  return {
    totalUsers: row ? metric(row, 0) : 0,
    newUsers: row ? metric(row, 1) : 0,
    sessions: row ? metric(row, 2) : 0,
    screenPageViews: row ? metric(row, 3) : 0,
  };
};

export const queryReturningVisitors = async (env: AnalyticsEnv, range: AnalyticsDateRange): Promise<number> => {
  const response = await runReportWithFilterFallback(
    env,
    {
      dateRanges: [range],
      dimensions: [{ name: 'newVsReturning' }],
      metrics: [{ name: 'activeUsers' }],
      limit: '10',
    },
    'pagePath'
  );

  let returningUsers = 0;
  asRows(response).forEach((row) => {
    const bucket = dim(row, 0).trim().toLowerCase();
    if (bucket === 'returning' || bucket === 'established') {
      returningUsers += metric(row, 0);
    }
  });

  return Math.max(0, Math.round(returningUsers));
};

export const queryVisitorsByDate = async (env: AnalyticsEnv, range: AnalyticsDateRange): Promise<Map<string, number>> => {
  const response = await runReportWithFilterFallback(
    env,
    {
      dateRanges: [range],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'totalUsers' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      keepEmptyRows: true,
      limit: '100000',
    },
    'pagePath'
  );
  const output = new Map<string, number>();
  asRows(response).forEach((row) => {
    const date = dim(row, 0);
    if (!date) return;
    const normalized = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    output.set(normalized, metric(row, 0));
  });
  return output;
};

export const queryVisitorsByHour = async (env: AnalyticsEnv, range: AnalyticsDateRange): Promise<Map<string, number>> => {
  const response = await runReportWithFilterFallback(
    env,
    {
      dateRanges: [range],
      dimensions: [{ name: 'hour' }],
      metrics: [{ name: 'totalUsers' }],
      orderBys: [{ dimension: { dimensionName: 'hour' } }],
      keepEmptyRows: true,
      limit: '24',
    },
    'pagePath'
  );
  const output = new Map<string, number>();
  asRows(response).forEach((row) => {
    const hour = dim(row, 0);
    if (!hour) return;
    output.set(hour.padStart(2, '0'), metric(row, 0));
  });
  return output;
};

export const queryTrafficSources = async (
  env: AnalyticsEnv,
  range: AnalyticsDateRange
): Promise<Array<{ source: string; sessions: number }>> => {
  const response = await runGa4Report(env, {
    dateRanges: [range],
    dimensions: [{ name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: {
      notExpression: {
        filter: {
          fieldName: 'landingPagePlusQueryString',
          stringFilter: {
            matchType: 'BEGINS_WITH',
            value: '/admin',
            caseSensitive: false,
          },
        },
      },
    },
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: '12',
  });
  return asRows(response)
    .map((row) => ({
      source: dim(row, 0) || '(direct)',
      sessions: metric(row, 0),
    }))
    .filter((row) => row.sessions > 0);
};

export const queryLandingPages = async (
  env: AnalyticsEnv,
  range: AnalyticsDateRange
): Promise<Array<{ path: string; sessions: number; engagementRatePct: number }>> => {
  const response = await runGa4Report(env, {
    dateRanges: [range],
    dimensions: [{ name: 'landingPagePlusQueryString' }],
    metrics: [{ name: 'sessions' }, { name: 'engagementRate' }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          {
            notExpression: {
              filter: {
                fieldName: 'landingPagePlusQueryString',
                stringFilter: {
                  matchType: 'BEGINS_WITH',
                  value: '/admin',
                  caseSensitive: false,
                },
              },
            },
          },
          {
            notExpression: {
              filter: {
                fieldName: 'landingPagePlusQueryString',
                stringFilter: {
                  matchType: 'BEGINS_WITH',
                  value: '/api/admin',
                  caseSensitive: false,
                },
              },
            },
          },
        ],
      },
    },
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: '10',
  });
  return asRows(response)
    .map((row) => {
      const rawPath = dim(row, 0);
      return {
        path: rawPath,
        sessions: metric(row, 0),
        engagementRatePct: metric(row, 1) * 100,
      };
    })
    .filter((row) => row.path.trim().length > 0 && row.sessions > 0);
};

export const queryEventTotals = async (
  env: AnalyticsEnv,
  range: AnalyticsDateRange,
  eventNames: string[]
): Promise<Map<string, number>> => {
  const response = await runGa4Report(env, {
    dateRanges: [range],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: buildEventInListFilter(eventNames),
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: '50',
  });

  const output = new Map<string, number>();
  asRows(response).forEach((row) => {
    const eventName = dim(row, 0);
    if (!eventName) return;
    output.set(eventName, metric(row, 0));
  });
  return output;
};

export const queryEventByDate = async (
  env: AnalyticsEnv,
  range: AnalyticsDateRange,
  eventNames: string[]
): Promise<Map<string, Map<string, number>>> => {
  const response = await runGa4Report(env, {
    dateRanges: [range],
    dimensions: [{ name: 'date' }, { name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: buildEventInListFilter(eventNames),
    orderBys: [{ dimension: { dimensionName: 'date' } }],
    limit: '10000',
  });

  const output = new Map<string, Map<string, number>>();
  asRows(response).forEach((row) => {
    const date = dim(row, 0);
    const eventName = dim(row, 1);
    if (!date || !eventName) return;
    const normalizedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const eventMap = output.get(normalizedDate) || new Map<string, number>();
    eventMap.set(eventName, metric(row, 0));
    output.set(normalizedDate, eventMap);
  });
  return output;
};

export const queryEventByHour = async (
  env: AnalyticsEnv,
  range: AnalyticsDateRange,
  eventNames: string[]
): Promise<Map<string, Map<string, number>>> => {
  const response = await runGa4Report(env, {
    dateRanges: [range],
    dimensions: [{ name: 'hour' }, { name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: buildEventInListFilter(eventNames),
    orderBys: [{ dimension: { dimensionName: 'hour' } }],
    keepEmptyRows: true,
    limit: '500',
  });

  const output = new Map<string, Map<string, number>>();
  asRows(response).forEach((row) => {
    const hour = dim(row, 0).padStart(2, '0');
    const eventName = dim(row, 1);
    if (!hour || !eventName) return;
    const eventMap = output.get(hour) || new Map<string, number>();
    eventMap.set(eventName, metric(row, 0));
    output.set(hour, eventMap);
  });
  return output;
};

export type ProductBehaviorRow = {
  itemId: string;
  itemName: string;
  itemCategory: string;
  itemViewEvents: number;
  itemsAddedToCart: number;
};

const PRODUCT_BEHAVIOR_DIMENSIONS = ['itemId', 'itemName', 'itemCategory'] as const;
const PRODUCT_BEHAVIOR_VIEW_METRIC_CANDIDATES = ['itemsViewed'] as const;
const PRODUCT_BEHAVIOR_CART_METRIC = 'itemsAddedToCart';
const DEFAULT_PROPERTY_ID = '529430584';
const productBehaviorCompatibilityCache = new Set<string>();
type ProductBehaviorViewMetricCandidate = (typeof PRODUCT_BEHAVIOR_VIEW_METRIC_CANDIDATES)[number];
type ProductBehaviorCompatibilityStatus = 'compatible' | 'incompatible' | 'unavailable';

type ProductBehaviorRequestShapeSummary = {
  dimensions: string[];
  metrics: string[];
  orderByMetric: string | null;
  limit: string | null;
};

type ProductBehaviorCompatibilityOutcome = {
  status: ProductBehaviorCompatibilityStatus;
  incompatibleDimensions: string[];
  incompatibleMetrics: string[];
  detail: string;
};

type ProductBehaviorCandidateOutcome = {
  candidateName: ProductBehaviorViewMetricCandidate;
  requestShape: ProductBehaviorRequestShapeSummary;
  compatibility: ProductBehaviorCompatibilityOutcome;
  execution: 'skipped' | 'attempted' | 'succeeded' | 'failed';
  skipReason?: string;
  runReportError?: string;
  rowCount?: number;
};

const assertProductBehaviorQueryShape = (request: {
  dimensions?: Array<{ name: string }>;
  metrics?: Array<{ name: string }>;
}) => {
  const dimensionNames = (request.dimensions || []).map((dimension) => dimension.name);
  const metricNames = (request.metrics || []).map((metricDef) => metricDef.name);
  if (dimensionNames.includes('eventName') || metricNames.includes('eventCount')) {
    throw new Error(
      '[analytics][ga4] Invalid Product Interest item-level query shape. Use item dimensions with itemsViewed/itemsAddedToCart metrics.'
    );
  }
  const hasAllRequiredDimensions = PRODUCT_BEHAVIOR_DIMENSIONS.every((name) => dimensionNames.includes(name));
  const hasCartMetric = metricNames.includes(PRODUCT_BEHAVIOR_CART_METRIC);
  const hasViewMetricCandidate = PRODUCT_BEHAVIOR_VIEW_METRIC_CANDIDATES.some((name) => metricNames.includes(name));
  if (!hasAllRequiredDimensions || !hasCartMetric || !hasViewMetricCandidate) {
    throw new Error(
      `[analytics][ga4] Product Interest item-level query is missing required fields. Required dimensions: ${PRODUCT_BEHAVIOR_DIMENSIONS.join(', ')}. Required metrics: one of [${PRODUCT_BEHAVIOR_VIEW_METRIC_CANDIDATES.join(
        ', '
      )}] plus ${PRODUCT_BEHAVIOR_CART_METRIC}.`
    );
  }
};

const getProductBehaviorCompatibilityCacheKey = (
  env: AnalyticsEnv,
  request: {
    dimensions?: Array<{ name: string }>;
    metrics?: Array<{ name: string }>;
  }
): string => {
  const propertyId = (env.GA4_PROPERTY_ID || '').trim() || DEFAULT_PROPERTY_ID;
  const dimensions = (request.dimensions || []).map((dimension) => dimension.name).join(',');
  const metrics = (request.metrics || []).map((metricDef) => metricDef.name).join(',');
  return `${propertyId}|${dimensions}|${metrics}`;
};

const normalizeGa4FieldName = (value: string): string => value.trim().toLowerCase();

const selectRequestedIncompatibleFields = (requestedFields: string[], incompatibleFields: string[]): string[] => {
  if (!requestedFields.length || !incompatibleFields.length) return [];
  const requested = new Set(requestedFields.map((fieldName) => normalizeGa4FieldName(fieldName)));
  const selected = incompatibleFields.filter((fieldName) => requested.has(normalizeGa4FieldName(fieldName)));
  return Array.from(new Set(selected));
};

const truncateForProductBehaviorSummary = (value: string, max = 220): string =>
  value.length <= max ? value : `${value.slice(0, max - 3)}...`;

const summarizeProductBehaviorRequestShape = (request: {
  dimensions?: Array<{ name: string }>;
  metrics?: Array<{ name: string }>;
  orderBys?: Array<{ metric?: { metricName?: string } }>;
  limit?: string;
}): ProductBehaviorRequestShapeSummary => ({
  dimensions: (request.dimensions || []).map((dimension) => dimension.name),
  metrics: (request.metrics || []).map((metricDef) => metricDef.name),
  orderByMetric: request.orderBys?.[0]?.metric?.metricName || null,
  limit: request.limit || null,
});

const describeProductBehaviorOutcome = (outcome: ProductBehaviorCandidateOutcome): string => {
  const requestShapeDescription = `shape(dimensions=${outcome.requestShape.dimensions.join(', ') || 'none'}; metrics=${
    outcome.requestShape.metrics.join(', ') || 'none'
  }; orderBy=${outcome.requestShape.orderByMetric || 'none'}; limit=${outcome.requestShape.limit || 'none'})`;
  const compatibilityDescription =
    outcome.compatibility.status === 'incompatible'
      ? `compatibility=incompatible(dimensions=${outcome.compatibility.incompatibleDimensions.join(', ') || 'none'}; metrics=${
          outcome.compatibility.incompatibleMetrics.join(', ') || 'none'
        })`
      : `compatibility=${outcome.compatibility.status}`;
  const details: string[] = [requestShapeDescription, compatibilityDescription, `execution=${outcome.execution}`];
  if (outcome.skipReason) details.push(`skipReason=${outcome.skipReason}`);
  if (outcome.runReportError) details.push(`runReportError=${truncateForProductBehaviorSummary(outcome.runReportError)}`);
  if (typeof outcome.rowCount === 'number') details.push(`rowCount=${outcome.rowCount}`);
  return `${outcome.candidateName}{${details.join(', ')}}`;
};

const summarizeProductBehaviorOutcomes = (outcomes: ProductBehaviorCandidateOutcome[]): string =>
  outcomes.length ? outcomes.map((outcome) => describeProductBehaviorOutcome(outcome)).join(' | ') : 'none';

const checkProductBehaviorCompatibilityPreflight = async (
  env: AnalyticsEnv,
  request: {
    dimensions?: Array<{ name: string }>;
    metrics?: Array<{ name: string }>;
  }
): Promise<ProductBehaviorCompatibilityOutcome> => {
  const requestedDimensions = (request.dimensions || []).map((dimension) => dimension.name);
  const requestedMetrics = (request.metrics || []).map((metricDef) => metricDef.name);
  const cacheKey = getProductBehaviorCompatibilityCacheKey(env, request);
  if (productBehaviorCompatibilityCache.has(cacheKey)) {
    return {
      status: 'compatible',
      incompatibleDimensions: [],
      incompatibleMetrics: [],
      detail: 'compatibility preflight passed from cache for requested fields',
    };
  }

  try {
    const compatibility = await checkGa4ReportCompatibility(env, {
      dimensions: request.dimensions,
      metrics: request.metrics,
      compatibilityFilter: 'INCOMPATIBLE',
    });
    const requestedIncompatibleDimensions = selectRequestedIncompatibleFields(
      requestedDimensions,
      compatibility.incompatibleDimensions
    );
    const requestedIncompatibleMetrics = selectRequestedIncompatibleFields(requestedMetrics, compatibility.incompatibleMetrics);
    if (requestedIncompatibleDimensions.length || requestedIncompatibleMetrics.length) {
      return {
        status: 'incompatible',
        incompatibleDimensions: requestedIncompatibleDimensions,
        incompatibleMetrics: requestedIncompatibleMetrics,
        detail: `[analytics][ga4] Product Interest compatibility preflight marked requested fields incompatible. requestedDimensions=[${
          requestedDimensions.join(', ') || 'none'
        }], requestedMetrics=[${requestedMetrics.join(', ') || 'none'}], incompatibleRequestedDimensions=[${
          requestedIncompatibleDimensions.join(', ') || 'none'
        }], incompatibleRequestedMetrics=[${requestedIncompatibleMetrics.join(', ') || 'none'}]`,
      };
    }

    const unrelatedIncompatibleDimensionCount = Math.max(
      0,
      compatibility.incompatibleDimensions.length - requestedIncompatibleDimensions.length
    );
    const unrelatedIncompatibleMetricCount = Math.max(
      0,
      compatibility.incompatibleMetrics.length - requestedIncompatibleMetrics.length
    );
    productBehaviorCompatibilityCache.add(cacheKey);
    return {
      status: 'compatible',
      incompatibleDimensions: [],
      incompatibleMetrics: [],
      detail:
        unrelatedIncompatibleDimensionCount > 0 || unrelatedIncompatibleMetricCount > 0
          ? `compatibility preflight did not mark requested fields incompatible (ignored unrelated incompatible fields: dimensions=${unrelatedIncompatibleDimensionCount}, metrics=${unrelatedIncompatibleMetricCount})`
          : 'compatibility preflight did not mark requested fields incompatible',
    };
  } catch (error) {
    return {
      status: 'unavailable',
      incompatibleDimensions: [],
      incompatibleMetrics: [],
      detail: `compatibility preflight unavailable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

export const queryProductBehavior = async (
  env: AnalyticsEnv,
  range: AnalyticsDateRange
): Promise<ProductBehaviorRow[]> => {
  const candidateOutcomes: ProductBehaviorCandidateOutcome[] = [];

  for (const viewMetricName of PRODUCT_BEHAVIOR_VIEW_METRIC_CANDIDATES) {
    const request = {
      dateRanges: [range],
      dimensions: PRODUCT_BEHAVIOR_DIMENSIONS.map((name) => ({ name })),
      metrics: [{ name: viewMetricName }, { name: PRODUCT_BEHAVIOR_CART_METRIC }],
      orderBys: [{ metric: { metricName: viewMetricName }, desc: true }],
      limit: '50000',
    };
    assertProductBehaviorQueryShape(request);
    const requestShape = summarizeProductBehaviorRequestShape(request);
    const compatibility = await checkProductBehaviorCompatibilityPreflight(env, request);
    const candidateOutcome: ProductBehaviorCandidateOutcome = {
      candidateName: viewMetricName,
      requestShape,
      compatibility,
      execution: 'skipped',
    };

    if (compatibility.status === 'incompatible') {
      candidateOutcome.skipReason =
        'compatibility preflight explicitly marked one or more requested dimensions/metrics incompatible';
      candidateOutcomes.push(candidateOutcome);
      console.warn('[analytics][ga4] Product Interest item-level metric candidate skipped', {
        candidateName: viewMetricName,
        requestShape,
        compatibilityStatus: compatibility.status,
        incompatibleDimensions: compatibility.incompatibleDimensions,
        incompatibleMetrics: compatibility.incompatibleMetrics,
        compatibilityDetail: compatibility.detail,
        skipReason: candidateOutcome.skipReason,
      });
      continue;
    }

    if (compatibility.status === 'unavailable') {
      console.warn('[analytics][ga4] Product Interest compatibility preflight unavailable; attempting runReport', {
        candidateName: viewMetricName,
        requestShape,
        compatibilityDetail: compatibility.detail,
      });
    } else {
      console.info('[analytics][ga4] Product Interest compatibility preflight result', {
        candidateName: viewMetricName,
        requestShape,
        compatibilityDetail: compatibility.detail,
      });
    }

    try {
      candidateOutcome.execution = 'attempted';
      const response = await runGa4Report(env, request);
      const rows = asRows(response);
      candidateOutcome.execution = 'succeeded';
      candidateOutcome.rowCount = rows.length;
      candidateOutcomes.push(candidateOutcome);
      return rows.map((row) => ({
        itemId: dim(row, 0),
        itemName: dim(row, 1),
        itemCategory: dim(row, 2),
        itemViewEvents: metric(row, 0),
        itemsAddedToCart: metric(row, 1),
      }));
    } catch (error) {
      candidateOutcome.execution = 'failed';
      candidateOutcome.runReportError = error instanceof Error ? error.message : String(error);
      candidateOutcomes.push(candidateOutcome);
      console.warn('[analytics][ga4] Product Interest item-level metric candidate failed', {
        candidateName: viewMetricName,
        requestShape,
        compatibilityStatus: compatibility.status,
        compatibilityDetail: compatibility.detail,
        runReportError: candidateOutcome.runReportError,
      });
    }
  }

  const primaryOutcome = candidateOutcomes.find((outcome) => outcome.candidateName === PRODUCT_BEHAVIOR_VIEW_METRIC_CANDIDATES[0]);
  const primaryCandidateMessage =
    primaryOutcome?.execution === 'skipped' && primaryOutcome.compatibility.status === 'incompatible'
      ? 'Primary candidate itemsViewed was skipped because compatibility preflight explicitly marked requested dimensions/metrics incompatible.'
      : primaryOutcome?.execution === 'failed'
        ? 'Primary candidate itemsViewed reached runReport and failed.'
        : primaryOutcome
          ? `Primary candidate itemsViewed outcome: ${describeProductBehaviorOutcome(primaryOutcome)}.`
          : 'Primary candidate itemsViewed did not produce an outcome.';

  console.error('[analytics][ga4] Product Interest item-level behavior query failed', {
    dimensions: [...PRODUCT_BEHAVIOR_DIMENSIONS],
    viewMetricCandidates: [...PRODUCT_BEHAVIOR_VIEW_METRIC_CANDIDATES],
    cartMetric: PRODUCT_BEHAVIOR_CART_METRIC,
    candidateOutcomes,
  });

  throw new Error(
    `[analytics][ga4] Product Interest item-level behavior query failed. ${primaryCandidateMessage} Candidate outcomes: ${summarizeProductBehaviorOutcomes(
      candidateOutcomes
    )}`
  );
};

export const queryGenerateLeadByFormType = async (
  env: AnalyticsEnv,
  range: AnalyticsDateRange
): Promise<Map<string, number> | null> => {
  try {
    const response = await runGa4Report(env, {
      dateRanges: [range],
      dimensions: [{ name: 'customEvent:form_type' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: buildEventInListFilter(['generate_lead']),
      limit: '20',
    });
    const output = new Map<string, number>();
    asRows(response).forEach((row) => {
      const formType = (dim(row, 0) || '').trim().toLowerCase();
      if (!formType) return;
      output.set(formType, metric(row, 0));
    });
    return output;
  } catch (error) {
    console.warn('[analytics][ga4] customEvent:form_type unavailable; will use fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const parseIsoDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const addDays = (value: Date, days: number): Date => new Date(value.getTime() + days * 24 * 60 * 60 * 1000);

const fmtDay = (value: Date): string =>
  `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;

type BucketedSeriesPoint = {
  label: string;
  value: number;
  rangeStart: string;
  rangeEnd: string;
  hourStart?: number;
  hourEnd?: number;
};

export const bucketDateSeries = (
  timeframe: AnalyticsTimeframe,
  range: AnalyticsDateRange,
  dayValueMap: Map<string, number>
): BucketedSeriesPoint[] => {
  const start = parseIsoDate(range.startDate);
  const end = parseIsoDate(range.endDate);
  const buckets: BucketedSeriesPoint[] = [];

  if (timeframe === 'last7Days') {
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const key = fmtDay(cursor);
      const label = cursor.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      buckets.push({
        label,
        value: dayValueMap.get(key) || 0,
        rangeStart: key,
        rangeEnd: key,
      });
    }
    return buckets;
  }

  if (timeframe === 'last30Days' || timeframe === 'last90Days') {
    const segmentCount = timeframe === 'last30Days' ? 4 : 3;
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    const segmentSize = Math.max(1, Math.ceil(totalDays / segmentCount));
    for (let index = 0; index < segmentCount; index += 1) {
      const segmentStart = addDays(start, index * segmentSize);
      if (segmentStart > end) break;
      const segmentEnd = addDays(segmentStart, segmentSize - 1) > end ? end : addDays(segmentStart, segmentSize - 1);
      let sum = 0;
      for (let cursor = new Date(segmentStart); cursor <= segmentEnd; cursor = addDays(cursor, 1)) {
        sum += dayValueMap.get(fmtDay(cursor)) || 0;
      }
      const label = timeframe === 'last30Days' ? `Week ${index + 1}` : `Month ${index + 1}`;
      buckets.push({
        label,
        value: sum,
        rangeStart: fmtDay(segmentStart),
        rangeEnd: fmtDay(segmentEnd),
      });
    }
    return buckets;
  }

  if (timeframe === 'last12Months' || timeframe === 'yearToDate') {
    const byMonth = new Map<string, { value: number; rangeStart: string; rangeEnd: string }>();
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const dayKey = fmtDay(cursor);
      const monthKey = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      const existing = byMonth.get(monthKey);
      if (existing) {
        existing.value += dayValueMap.get(dayKey) || 0;
        existing.rangeEnd = dayKey;
      } else {
        byMonth.set(monthKey, {
          value: dayValueMap.get(dayKey) || 0,
          rangeStart: dayKey,
          rangeEnd: dayKey,
        });
      }
    }
    Array.from(byMonth.entries()).forEach(([key, bucket]) => {
      const [year, month] = key.split('-').map((part) => Number(part));
      const label = new Date(Date.UTC(year, (month || 1) - 1, 1)).toLocaleDateString('en-US', {
        month: 'short',
        timeZone: 'UTC',
      });
      buckets.push({
        label,
        value: bucket.value,
        rangeStart: bucket.rangeStart,
        rangeEnd: bucket.rangeEnd,
      });
    });
    return buckets;
  }

  if (timeframe === 'lifetime') {
    const byYear = new Map<string, { value: number; rangeStart: string; rangeEnd: string }>();
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const dayKey = fmtDay(cursor);
      const yearKey = String(cursor.getUTCFullYear());
      const existing = byYear.get(yearKey);
      if (existing) {
        existing.value += dayValueMap.get(dayKey) || 0;
        existing.rangeEnd = dayKey;
      } else {
        byYear.set(yearKey, {
          value: dayValueMap.get(dayKey) || 0,
          rangeStart: dayKey,
          rangeEnd: dayKey,
        });
      }
    }
    Array.from(byYear.entries()).forEach(([label, bucket]) => {
      buckets.push({
        label,
        value: bucket.value,
        rangeStart: bucket.rangeStart,
        rangeEnd: bucket.rangeEnd,
      });
    });
    return buckets;
  }

  return [
    {
      label: 'Period',
      value: dayValueMap.get(range.startDate) || 0,
      rangeStart: range.startDate,
      rangeEnd: range.startDate,
    },
  ];
};

export const bucketHourSeries = (hourValueMap: Map<string, number>, rangeDate: string): BucketedSeriesPoint[] => {
  const buckets: BucketedSeriesPoint[] = [];
  const ranges = [
    [0, 2, '12a'],
    [3, 5, '3a'],
    [6, 8, '6a'],
    [9, 11, '9a'],
    [12, 14, '12p'],
    [15, 17, '3p'],
    [18, 20, '6p'],
    [21, 23, '9p'],
  ];
  ranges.forEach(([start, end, label]) => {
    let sum = 0;
    for (let hour = Number(start); hour <= Number(end); hour += 1) {
      sum += hourValueMap.get(String(hour).padStart(2, '0')) || 0;
    }
    buckets.push({
      label: String(label),
      value: sum,
      rangeStart: rangeDate,
      rangeEnd: rangeDate,
      hourStart: Number(start),
      hourEnd: Number(end),
    });
  });
  return buckets;
};
