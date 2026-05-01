import type { CatalogMaps } from './db';

type RawTrafficSourceRow = {
  source: string;
  sessions: number;
};

type RawLandingPageRow = {
  path: string;
  sessions: number;
  engagementRatePct: number;
};

type SourceMixItem = {
  name: string;
  value: number;
  sessions: number;
};

type LandingPageItem = {
  path: string;
  visitors: number;
  engagementPct: number;
};

const PRODUCT_ROUTE_PATTERN = /^\/products?\/([^/]+)$/i;
const STRIPE_CHECKOUT_HOST = 'checkout.stripe.com';

const STATIC_PAGE_LABELS: Record<string, string> = {
  '/': 'Home Page',
  '/shop': 'Shop Page',
  '/gallery': 'Gallery Page',
  '/about': 'About Page',
  '/contact': 'Contact Page',
  '/custom-orders': 'Custom Orders Page',
  '/join': 'Join Page',
  '/terms': 'Terms Page',
  '/privacy': 'Privacy Page',
  '/checkout': 'Checkout Page',
  '/checkout/return': 'Checkout Return Page',
};

const normalizeKey = (value: string | null | undefined): string =>
  (value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const toTitleCase = (value: string): string =>
  value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

const clampPct = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.min(100, Math.max(0, value)).toFixed(1));
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizePathname = (rawPath: string): string => {
  const trimmed = (rawPath || '').trim();
  if (!trimmed) return '/';

  let value = trimmed;
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      value = `${parsed.pathname || '/'}${parsed.search || ''}`;
    } catch {
      value = trimmed;
    }
  }

  const [withoutHash] = value.split('#');
  const [pathOnly] = withoutHash.split('?');
  let pathname = pathOnly || '/';

  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  pathname = pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);

  return pathname || '/';
};

const resolveProductLabel = (rawSegment: string, catalog: CatalogMaps): string | null => {
  const segment = safeDecode(rawSegment).trim();
  if (!segment) return null;

  if (catalog.byId.has(segment)) return catalog.byId.get(segment)!.name;
  if (catalog.byStripeProductId.has(segment)) return catalog.byStripeProductId.get(segment)!.name;
  if (catalog.byStripePriceId.has(segment)) return catalog.byStripePriceId.get(segment)!.name;

  const key = normalizeKey(segment);
  if (!key) return null;

  if (catalog.byNormalizedName.has(key)) return catalog.byNormalizedName.get(key)!.name;

  const fallback = catalog.products.find((product) => {
    const productIdKey = normalizeKey(product.id);
    const stripeKey = normalizeKey(product.stripeProductId || '');
    return key === productIdKey || (!!stripeKey && key === stripeKey);
  });

  return fallback?.name || null;
};

const fallbackPageLabel = (pathname: string): string => {
  const segments = pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => safeDecode(segment));

  if (!segments.length) return 'Home Page';

  const looksOpaque = segments.some((segment) => /^[0-9a-f-]{16,}$/i.test(segment) || segment.length > 32);
  if (looksOpaque) return 'Page';

  return `${toTitleCase(segments.join(' '))} Page`;
};

const normalizeLandingPathLabel = (rawPath: string, catalog: CatalogMaps): string => {
  const pathname = normalizePathname(rawPath);
  const pathnameLower = pathname.toLowerCase();
  if (STATIC_PAGE_LABELS[pathnameLower]) return STATIC_PAGE_LABELS[pathnameLower];

  const productMatch = pathname.match(PRODUCT_ROUTE_PATTERN);
  if (productMatch?.[1]) {
    const productName = resolveProductLabel(productMatch[1], catalog);
    return productName || 'Product Page';
  }

  return fallbackPageLabel(pathname);
};

const isMeaningfulLandingPath = (rawPath: string): boolean => {
  const normalized = (rawPath || '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === '(not set)') return false;
  return true;
};

const normalizeSourceHost = (rawSource: string): string => {
  const trimmed = (rawSource || '').trim().toLowerCase();
  if (!trimmed) return '(direct)';

  if (/^https?:\/\//.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.hostname.toLowerCase();
    } catch {
      return trimmed;
    }
  }

  const withoutPath = trimmed.split('/')[0];
  return withoutPath || trimmed;
};

const normalizeTrafficSourceLabel = (rawSource: string): string | null => {
  const source = (rawSource || '').trim();
  const sourceLower = source.toLowerCase();
  const host = normalizeSourceHost(source);

  if (
    sourceLower === '(direct)' ||
    sourceLower === 'direct' ||
    sourceLower === '(none)' ||
    sourceLower === '(not set)' ||
    host === '(direct)'
  ) {
    return 'Direct';
  }

  if (host === STRIPE_CHECKOUT_HOST || sourceLower.includes(STRIPE_CHECKOUT_HOST)) {
    return null;
  }

  if (sourceLower.includes('google') || host === 'google' || host.endsWith('.google.com')) {
    return 'Google Search';
  }

  if (
    sourceLower.includes('instagram') ||
    sourceLower === 'ig' ||
    host.includes('instagram.com') ||
    host === 'ig'
  ) {
    return 'Instagram';
  }

  if (sourceLower.includes('tiktok') || host.includes('tiktok.com')) {
    return 'TikTok';
  }

  if (
    sourceLower.includes('facebook') ||
    host === 'facebook.com' ||
    host.endsWith('.facebook.com') ||
    host === 'fb.com' ||
    host.endsWith('.fb.com')
  ) {
    return 'Facebook';
  }

  if (host.includes('.')) {
    const hostname = host.replace(/^www\./, '');
    const firstPart = hostname.split('.')[0] || hostname;
    return toTitleCase(firstPart);
  }

  return toTitleCase(source || 'Unknown');
};

export const normalizeTrafficSourcesForOverview = (
  rows: RawTrafficSourceRow[],
  limit = 6
): SourceMixItem[] => {
  const sessionsByLabel = new Map<string, number>();

  rows.forEach((row) => {
    const sessions = Number(row.sessions) || 0;
    if (sessions <= 0) return;
    const label = normalizeTrafficSourceLabel(row.source);
    if (!label) return;
    sessionsByLabel.set(label, (sessionsByLabel.get(label) || 0) + sessions);
  });

  const normalized = Array.from(sessionsByLabel.entries())
    .map(([label, sessions]) => ({ label, sessions }))
    .sort((a, b) => b.sessions - a.sessions);

  const limited = normalized.slice(0, Math.max(1, limit));
  const totalSessions = limited.reduce((sum, item) => sum + item.sessions, 0);

  return limited.map((item) => ({
    name: item.label,
    sessions: item.sessions,
    value: totalSessions > 0 ? clampPct((item.sessions / totalSessions) * 100) : 0,
  }));
};

export const normalizeLandingPagesForOverview = (
  rows: RawLandingPageRow[],
  catalog: CatalogMaps,
  limit = 5
): LandingPageItem[] => {
  const grouped = new Map<string, { sessions: number; weightedEngagement: number }>();

  rows.forEach((row) => {
    const visitors = Math.max(0, Math.round(Number(row.sessions) || 0));
    if (visitors <= 0) return;
    if (!isMeaningfulLandingPath(row.path)) return;
    const label = normalizeLandingPathLabel(row.path, catalog);
    const existing = grouped.get(label) || { sessions: 0, weightedEngagement: 0 };
    existing.sessions += visitors;
    existing.weightedEngagement += (Number(row.engagementRatePct) || 0) * visitors;
    grouped.set(label, existing);
  });

  return Array.from(grouped.entries())
    .map(([label, data]) => ({
      path: label,
      visitors: data.sessions,
      engagementPct: data.sessions > 0 ? clampPct(data.weightedEngagement / data.sessions) : 0,
    }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, Math.max(1, limit));
};
