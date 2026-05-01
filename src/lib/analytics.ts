import type { CartItem, Product } from './types';

const measurementId = (import.meta.env.VITE_GA4_MEASUREMENT_ID || '').trim();
const DEFAULT_CURRENCY = 'USD';
const PURCHASE_STORAGE_KEY_PREFIX = 'ga4_purchase_sent_';
const GA4_MEASUREMENT_ID_REGEX = /^G-[A-Z0-9]+$/i;

type GtagCommand = 'js' | 'config' | 'event';
type GtagParams = Record<string, unknown>;

export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  item_list_name?: string;
  price?: number;
  quantity?: number;
  product_id?: string;
  stripe_product_id?: string;
  stripe_price_id?: string;
  product_slug?: string;
};

type PurchasePayload = {
  transactionId: string;
  items: AnalyticsItem[];
  currency?: string | null;
  value?: number | null;
  valueCents?: number | null;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: GtagCommand, nameOrDate: string | Date, params?: GtagParams) => void;
  }
}

let initializedMeasurementId: string | null = null;
let lastTrackedPath: string | null = null;
let lastViewedItemKey: string | null = null;
const onceEventKeys = new Set<string>();
const purchaseEventMemory = new Set<string>();
let missingMeasurementIdWarningShown = false;
let invalidMeasurementIdWarningShown = false;

function getCurrentPath() {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function centsToDollars(cents: number | null | undefined): number | null {
  if (!Number.isFinite(cents as number)) return null;
  return Number(cents) / 100;
}

function normalizeCurrency(currency?: string | null): string {
  const trimmed = (currency || '').trim();
  return (trimmed || DEFAULT_CURRENCY).toUpperCase();
}

function getItemValue(item: AnalyticsItem): number {
  const quantity = Number.isFinite(item.quantity as number) ? Number(item.quantity) : 1;
  const price = Number.isFinite(item.price as number) ? Number(item.price) : 0;
  return price * quantity;
}

function cleanIdentifier(value: string | null | undefined): string {
  return (value || '').trim();
}

function resolveCanonicalAnalyticsItemId(
  canonicalProductId: string | null | undefined,
  aliasCandidates: Array<string | null | undefined>,
  fallback: string
): string {
  const canonical = cleanIdentifier(canonicalProductId);
  if (canonical) return canonical;
  for (const candidate of aliasCandidates) {
    const cleaned = cleanIdentifier(candidate);
    if (cleaned) return cleaned;
  }
  const normalizedFallback = cleanIdentifier(fallback);
  return normalizedFallback || 'unknown-item';
}

function ensureGtagScript(id: string) {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector<HTMLScriptElement>(`script[data-ga4-measurement-id="${id}"]`);
  if (existing) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.setAttribute('data-ga4-measurement-id', id);
  document.head.appendChild(script);
}

function ensureGtagFn() {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag === 'function') return;
  window.gtag = function gtag(command, nameOrDate, params) {
    if (!window.dataLayer) window.dataLayer = [];
    window.dataLayer.push(arguments);
  };
}

function getPurchaseStorageKey(transactionId: string) {
  return `${PURCHASE_STORAGE_KEY_PREFIX}${transactionId}`;
}

function hasTrackedPurchase(transactionId: string): boolean {
  if (purchaseEventMemory.has(transactionId)) return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(getPurchaseStorageKey(transactionId)) === '1';
  } catch {
    return false;
  }
}

function markPurchaseTracked(transactionId: string) {
  purchaseEventMemory.add(transactionId);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getPurchaseStorageKey(transactionId), '1');
  } catch {
    // ignore storage errors
  }
}

function trackEventOnce(eventKey: string, eventName: string, params?: GtagParams): boolean {
  if (onceEventKeys.has(eventKey)) return false;
  const sent = trackEvent(eventName, params);
  if (sent) onceEventKeys.add(eventKey);
  return sent;
}

export function analyticsEnabled() {
  return GA4_MEASUREMENT_ID_REGEX.test(measurementId);
}

export function initAnalytics() {
  if (typeof window === 'undefined') return false;
  if (!measurementId) {
    if (!missingMeasurementIdWarningShown) {
      console.warn(
        '[analytics] Missing VITE_GA4_MEASUREMENT_ID. GA4 bootstrap skipped and no analytics hits will be sent.'
      );
      missingMeasurementIdWarningShown = true;
    }
    return false;
  }
  if (!analyticsEnabled()) {
    if (!invalidMeasurementIdWarningShown) {
      console.warn(
        `[analytics] Invalid VITE_GA4_MEASUREMENT_ID "${measurementId}". Expected format like "G-XXXXXXXXXX". GA4 bootstrap skipped.`
      );
      invalidMeasurementIdWarningShown = true;
    }
    return false;
  }
  if (initializedMeasurementId === measurementId) return true;

  ensureGtagScript(measurementId);
  ensureGtagFn();
  window.gtag?.('js', new Date());
  window.gtag?.('config', measurementId, { send_page_view: false });
  initializedMeasurementId = measurementId;
  lastTrackedPath = null;
  return true;
}

export function trackPageView(path = getCurrentPath()) {
  if (!initAnalytics()) return;
  const normalizedPath = path || '/';
  if (normalizedPath === lastTrackedPath) return;

  const pageLocation = new URL(normalizedPath, window.location.origin).toString();
  window.gtag?.('event', 'page_view', {
    page_path: normalizedPath,
    page_location: pageLocation,
    page_title: document.title,
  });
  lastTrackedPath = normalizedPath;
}

export function trackEvent(eventName: string, params?: GtagParams): boolean {
  if (!initAnalytics()) return false;
  window.gtag?.('event', eventName, params);
  return true;
}

export function mapProductToAnalyticsItem(
  product: Product,
  options?: { quantity?: number; itemListName?: string; itemVariant?: string | null; overridePriceCents?: number | null }
): AnalyticsItem {
  const priceCents =
    Number.isFinite(options?.overridePriceCents as number)
      ? Number(options?.overridePriceCents)
      : Number.isFinite(product.priceCents as number)
      ? Number(product.priceCents)
      : null;
  const price = centsToDollars(priceCents);

  const canonicalProductId = cleanIdentifier(product.id);
  const stripeProductId = cleanIdentifier(product.stripeProductId || null);
  const stripePriceId = cleanIdentifier(product.stripePriceId || null);
  const productSlug = cleanIdentifier(product.slug || null);

  return {
    item_id: resolveCanonicalAnalyticsItemId(canonicalProductId, [stripeProductId, stripePriceId, productSlug], product.name),
    item_name: product.name,
    item_category: product.category || product.type || product.collection || undefined,
    item_variant: options?.itemVariant || undefined,
    item_list_name: options?.itemListName || undefined,
    price: price === null ? undefined : price,
    quantity: Number.isFinite(options?.quantity as number) ? Number(options?.quantity) : 1,
    product_id: canonicalProductId || undefined,
    stripe_product_id: stripeProductId || undefined,
    stripe_price_id: stripePriceId || undefined,
    product_slug: productSlug || undefined,
  };
}

export function mapCartItemToAnalyticsItem(
  item: CartItem,
  options?: { itemListName?: string }
): AnalyticsItem {
  const canonicalProductId = cleanIdentifier(item.productId);
  const stripeProductId = cleanIdentifier(item.stripeProductId || null);
  const stripePriceId = cleanIdentifier(item.stripePriceId || null);
  return {
    item_id: resolveCanonicalAnalyticsItemId(canonicalProductId, [stripeProductId, stripePriceId], item.name),
    item_name: item.name,
    item_category: item.category || item.categories?.[0] || undefined,
    item_variant: item.optionValue || undefined,
    item_list_name: options?.itemListName,
    price: centsToDollars(item.priceCents) ?? undefined,
    quantity: Number.isFinite(item.quantity as number) ? Number(item.quantity) : 1,
    product_id: canonicalProductId || undefined,
    stripe_product_id: stripeProductId || undefined,
    stripe_price_id: stripePriceId || undefined,
  };
}

export function mapCheckoutLineItemToAnalyticsItem(
  item: {
    productId?: string | null;
    stripeProductId?: string | null;
    stripePriceId?: string | null;
    productSlug?: string | null;
    productName: string;
    category?: string | null;
    quantity?: number | null;
    unitAmount?: number | null;
    lineTotal?: number | null;
    optionValue?: string | null;
  },
  index: number
): AnalyticsItem {
  const unitAmountCents = Number.isFinite(item.unitAmount as number)
    ? Number(item.unitAmount)
    : Number.isFinite(item.lineTotal as number) && Number.isFinite(item.quantity as number) && Number(item.quantity) > 0
    ? Math.round(Number(item.lineTotal) / Number(item.quantity))
    : null;
  const canonicalProductId = cleanIdentifier(item.productId || null);
  const stripeProductId = cleanIdentifier(item.stripeProductId || null);
  const stripePriceId = cleanIdentifier(item.stripePriceId || null);
  const productSlug = cleanIdentifier(item.productSlug || null);

  return {
    item_id: resolveCanonicalAnalyticsItemId(
      canonicalProductId,
      [stripeProductId, stripePriceId, productSlug],
      `${item.productName}-${index + 1}`
    ),
    item_name: item.productName || 'Item',
    item_category: item.category || undefined,
    item_variant: item.optionValue || undefined,
    price: centsToDollars(unitAmountCents) ?? undefined,
    quantity: Number.isFinite(item.quantity as number) ? Number(item.quantity) : 1,
    product_id: canonicalProductId || undefined,
    stripe_product_id: stripeProductId || undefined,
    stripe_price_id: stripePriceId || undefined,
    product_slug: productSlug || undefined,
  };
}

export function trackViewItemList(itemListName: string, items: AnalyticsItem[]) {
  if (!items.length) return false;
  const listIds = items.map((item) => item.item_id).join('|');
  const contextPath = typeof window !== 'undefined' ? window.location.pathname : 'server';
  const eventKey = `view_item_list:${contextPath}:${itemListName}:${listIds}`;
  return trackEventOnce(eventKey, 'view_item_list', {
    item_list_name: itemListName,
    items: items.map((item) => ({ ...item, item_list_name: undefined })),
  });
}

export function trackSelectItem(itemListName: string, item: AnalyticsItem) {
  return trackEvent('select_item', {
    item_list_name: itemListName,
    items: [{ ...item, item_list_name: undefined }],
  });
}

export function trackViewItem(item: AnalyticsItem, currency?: string | null) {
  const itemKey = `${item.item_id}::${item.item_variant || ''}`;
  if (lastViewedItemKey === itemKey) return false;
  const value = getItemValue(item);
  const sent = trackEvent('view_item', {
    currency: normalizeCurrency(currency),
    value,
    items: [item],
  });
  if (sent) lastViewedItemKey = itemKey;
  return sent;
}

export function trackAddToCart(items: AnalyticsItem[], currency?: string | null) {
  if (!items.length) return false;
  const value = items.reduce((sum, item) => sum + getItemValue(item), 0);
  return trackEvent('add_to_cart', {
    currency: normalizeCurrency(currency),
    value,
    items,
  });
}

export function trackViewCart(items: AnalyticsItem[], currency?: string | null) {
  const value = items.reduce((sum, item) => sum + getItemValue(item), 0);
  return trackEvent('view_cart', {
    currency: normalizeCurrency(currency),
    value,
    items,
  });
}

export function trackBeginCheckout(items: AnalyticsItem[], currency?: string | null) {
  if (!items.length) return false;
  const value = items.reduce((sum, item) => sum + getItemValue(item), 0);
  return trackEvent('begin_checkout', {
    currency: normalizeCurrency(currency),
    value,
    items,
  });
}

export function trackPurchase(payload: PurchasePayload) {
  const transactionId = (payload.transactionId || '').trim();
  if (!transactionId || hasTrackedPurchase(transactionId)) return false;

  const computedValue = payload.items.reduce((sum, item) => sum + getItemValue(item), 0);
  const explicitValue = Number.isFinite(payload.value as number) ? Number(payload.value) : null;
  const explicitValueCents = Number.isFinite(payload.valueCents as number) ? Number(payload.valueCents) : null;
  const value =
    explicitValue !== null
      ? explicitValue
      : explicitValueCents !== null
      ? (centsToDollars(explicitValueCents) ?? computedValue)
      : computedValue;

  const sent = trackEvent('purchase', {
    transaction_id: transactionId,
    currency: normalizeCurrency(payload.currency),
    value,
    items: payload.items,
  });
  if (sent) markPurchaseTracked(transactionId);
  return sent;
}

export function trackGenerateLead(params?: { form_variant?: string; form_type?: string; form_location?: string }) {
  return trackEvent('generate_lead', params);
}

export function trackEmailSignup(params?: { form_location?: string }) {
  return trackEvent('email_signup', params);
}
