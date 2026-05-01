import type { AnalyticsDateRange } from './types';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results?: T[] }>;
  first<T>(): Promise<T | null>;
};

export type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type CategoryRow = {
  id: string;
  name: string | null;
  slug: string | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  slug?: string | null;
  category: string | null;
  is_active?: number | null;
  is_sold?: number | null;
  quantity_available?: number | null;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
};

type PurchaseRow = {
  product_id: string | null;
  quantity_total: number | null;
  order_count: number | null;
  product_id_resolved?: string | null;
  product_name?: string | null;
  product_category?: string | null;
  product_stripe_id?: string | null;
};

type PurchaseDailyRow = {
  day: string | null;
  quantity_total: number | null;
  order_count: number | null;
};

type PurchaseHourlyRow = {
  hour: string | null;
  quantity_total: number | null;
  order_count: number | null;
};

type MessageTypeRow = {
  type: string | null;
  count_total: number | null;
};

export type CanonicalProduct = {
  id: string;
  name: string;
  slug: string | null;
  category: string;
  stripeProductId: string | null;
  stripePriceId: string | null;
  isActive: boolean;
  isSold: boolean;
  quantityAvailable: number | null;
  listed: boolean;
};

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
};

export type CatalogMaps = {
  categories: CatalogCategory[];
  products: CanonicalProduct[];
  listedProducts: CanonicalProduct[];
  byId: Map<string, CanonicalProduct>;
  byStripeProductId: Map<string, CanonicalProduct>;
  byStripePriceId: Map<string, CanonicalProduct>;
  byNormalizedSlug: Map<string, CanonicalProduct>;
  byNormalizedName: Map<string, CanonicalProduct>;
};

export type CatalogAliasResolution = {
  product: CanonicalProduct;
  matchedBy: 'id' | 'stripe_product_id' | 'stripe_price_id' | 'slug' | 'name';
};

export type PurchaseProductMetric = {
  canonicalProductId: string;
  name: string;
  category: string;
  purchases: number;
  orders: number;
};

export type PurchaseMetrics = {
  totalPurchases: number;
  totalOrders: number;
  byProduct: Map<string, PurchaseProductMetric>;
  dailyPurchases: Map<string, number>;
  dailyOrders: Map<string, number>;
  hourlyPurchases: Map<string, number>;
  hourlyOrders: Map<string, number>;
};

const normalizeKey = (value: string | null | undefined): string =>
  (value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const safeInt = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
};

const CATEGORY_FALLBACK = 'Uncategorized';
const CUSTOM_ORDERS_CATEGORY = 'Custom Orders';
const UNKNOWN_PRODUCT_NAME = 'Unknown Product';
const CUSTOM_ORDER_ID_PATTERN = /^custom[_-]?order(?:[:/_-]|$)/i;
const CUSTOM_ORDER_TEXT_PATTERN = /\bcustom\s*orders?\b/i;

const normalizeDateRange = (range: AnalyticsDateRange): AnalyticsDateRange => ({
  startDate: (range.startDate || '').slice(0, 10),
  endDate: (range.endDate || '').slice(0, 10),
});

const isCustomOrderLikeValue = (value: string | null | undefined): boolean => {
  const raw = (value || '').trim();
  if (!raw) return false;
  const normalized = normalizeKey(raw);
  return CUSTOM_ORDER_ID_PATTERN.test(raw) || CUSTOM_ORDER_TEXT_PATTERN.test(raw) || normalized.includes('custom-order');
};

const resolveCanonicalCategory = (
  rawCategory: string | null | undefined,
  categoryLookup: Map<string, string>
): string => {
  if (isCustomOrderLikeValue(rawCategory)) return CUSTOM_ORDERS_CATEGORY;
  const normalized = normalizeKey(rawCategory);
  if (!normalized) return CATEGORY_FALLBACK;
  return categoryLookup.get(normalized) || (rawCategory || CATEGORY_FALLBACK);
};

export const loadCatalogMaps = async (db: D1Database): Promise<CatalogMaps> => {
  const { results: categoryRows } = await db
    .prepare(`SELECT id, name, slug FROM categories;`)
    .all<CategoryRow>();
  const categoryLookup = new Map<string, string>();
  const categories: CatalogCategory[] = [];
  (categoryRows || []).forEach((row) => {
    const display = (row.name || row.slug || '').trim();
    const slug = (row.slug || '').trim() || normalizeKey(display);
    const id = (row.id || '').trim() || slug;
    if (!display) return;
    categories.push({ id, name: display, slug });
    const slugKey = normalizeKey(row.slug);
    const nameKey = normalizeKey(row.name);
    if (slugKey) categoryLookup.set(slugKey, display);
    if (nameKey) categoryLookup.set(nameKey, display);
  });

  let productRows: ProductRow[] = [];
  const productQueries = [
    `SELECT id, name, slug, category, is_active, is_sold, quantity_available, stripe_product_id, stripe_price_id FROM products;`,
    `SELECT id, name, slug, category, is_active, is_sold, quantity_available, stripe_product_id FROM products;`,
    `SELECT id, name, category, is_active, is_sold, quantity_available, stripe_product_id, stripe_price_id FROM products;`,
    `SELECT id, name, category, is_active, is_sold, quantity_available, stripe_product_id FROM products;`,
    `SELECT id, name, slug, category, stripe_product_id, stripe_price_id FROM products;`,
    `SELECT id, name, slug, category, stripe_product_id FROM products;`,
    `SELECT id, name, category, stripe_product_id, stripe_price_id FROM products;`,
    `SELECT id, name, category, stripe_product_id FROM products;`,
  ];
  let lastProductQueryError: unknown = null;
  for (const query of productQueries) {
    try {
      const result = await db.prepare(query).all<ProductRow>();
      productRows = result.results || [];
      lastProductQueryError = null;
      break;
    } catch (error) {
      lastProductQueryError = error;
    }
  }
  if (lastProductQueryError) {
    console.warn('[analytics] loadCatalogMaps product query fallback exhausted', {
      error: lastProductQueryError instanceof Error ? lastProductQueryError.message : String(lastProductQueryError),
    });
  }

  const products: CanonicalProduct[] = [];
  const byId = new Map<string, CanonicalProduct>();
  const byStripeProductId = new Map<string, CanonicalProduct>();
  const byStripePriceId = new Map<string, CanonicalProduct>();
  const byNormalizedSlug = new Map<string, CanonicalProduct>();
  const byNormalizedName = new Map<string, CanonicalProduct>();

  productRows.forEach((row) => {
    const id = (row.id || '').trim();
    if (!id) return;
    const name = (row.name || '').trim() || id;
    const slug = (row.slug || '').trim();
    const stripeProductId = (row.stripe_product_id || '').trim() || null;
    const stripePriceId = (row.stripe_price_id || '').trim() || null;
    const category = resolveCanonicalCategory(row.category, categoryLookup);
    const isActiveRaw = (row as any).is_active;
    const isSoldRaw = (row as any).is_sold;
    const quantityAvailableRaw = (row as any).quantity_available;
    const isActive = isActiveRaw === undefined || isActiveRaw === null ? true : safeInt(isActiveRaw) !== 0;
    const isSold = isSoldRaw === undefined || isSoldRaw === null ? false : safeInt(isSoldRaw) === 1;
    const quantityAvailable =
      quantityAvailableRaw === undefined || quantityAvailableRaw === null ? null : safeInt(quantityAvailableRaw);
    const listed = isActive && !isSold && (quantityAvailable === null || quantityAvailable > 0);
    const product: CanonicalProduct = {
      id,
      name,
      slug: slug || null,
      category,
      stripeProductId,
      stripePriceId,
      isActive,
      isSold,
      quantityAvailable,
      listed,
    };
    products.push(product);
    byId.set(id, product);
    if (stripeProductId) byStripeProductId.set(stripeProductId, product);
    if (stripePriceId) byStripePriceId.set(stripePriceId, product);
    const slugKey = normalizeKey(slug);
    if (slugKey && !byNormalizedSlug.has(slugKey)) {
      byNormalizedSlug.set(slugKey, product);
    }
    const nameKey = normalizeKey(name);
    if (nameKey && !byNormalizedName.has(nameKey)) {
      byNormalizedName.set(nameKey, product);
    }
  });

  const listedProducts = products.filter((product) => product.listed);
  return { categories, products, listedProducts, byId, byStripeProductId, byStripePriceId, byNormalizedSlug, byNormalizedName };
};

export const resolveCatalogProductAlias = (
  catalog: CatalogMaps,
  params: { rawId?: string | null; rawSlug?: string | null; rawName?: string | null }
): CatalogAliasResolution | null => {
  const id = (params.rawId || '').trim();
  if (id && catalog.byId.has(id)) {
    return { product: catalog.byId.get(id)!, matchedBy: 'id' };
  }
  if (id && catalog.byStripeProductId.has(id)) {
    return { product: catalog.byStripeProductId.get(id)!, matchedBy: 'stripe_product_id' };
  }
  if (id && catalog.byStripePriceId.has(id)) {
    return { product: catalog.byStripePriceId.get(id)!, matchedBy: 'stripe_price_id' };
  }

  const slugCandidates = [params.rawSlug, params.rawId];
  for (const candidate of slugCandidates) {
    const slugKey = normalizeKey(candidate);
    if (!slugKey) continue;
    if (catalog.byNormalizedSlug.has(slugKey)) {
      return { product: catalog.byNormalizedSlug.get(slugKey)!, matchedBy: 'slug' };
    }
  }

  const nameKey = normalizeKey(params.rawName);
  if (nameKey && catalog.byNormalizedName.has(nameKey)) {
    return { product: catalog.byNormalizedName.get(nameKey)!, matchedBy: 'name' };
  }

  return null;
};

const resolveCanonicalProduct = (
  rawProductId: string | null | undefined,
  rawProductName: string | null | undefined,
  rawProductSlug: string | null | undefined,
  rawCategory: string | null | undefined,
  catalog: CatalogMaps
): CanonicalProduct => {
  const productId = (rawProductId || '').trim();
  const productName = (rawProductName || '').trim();
  const rawCategoryText = (rawCategory || '').trim();

  if (isCustomOrderLikeValue(productId) || isCustomOrderLikeValue(productName) || isCustomOrderLikeValue(rawCategoryText)) {
    const name = productName || 'Custom Order';
    const id = productId || `custom_order:${normalizeKey(name) || 'unknown'}`;
    return {
      id,
      name,
      slug: null,
      category: CUSTOM_ORDERS_CATEGORY,
      stripeProductId: null,
      stripePriceId: null,
      isActive: true,
      isSold: false,
      quantityAvailable: null,
      listed: false,
    };
  }

  const catalogResolution = resolveCatalogProductAlias(catalog, {
    rawId: productId,
    rawSlug: rawProductSlug,
    rawName: productName,
  });
  if (catalogResolution) {
    return catalogResolution.product;
  }
  const fallbackId = `unknown:${normalizeKey(productName || productId) || 'product'}`;
  const fallbackName = productName || UNKNOWN_PRODUCT_NAME;
  return {
    id: fallbackId,
    name: fallbackName,
    slug: null,
    category: resolveCanonicalCategory(rawCategoryText || null, new Map()),
    stripeProductId: null,
    stripePriceId: null,
    isActive: true,
    isSold: false,
    quantityAvailable: null,
    listed: false,
  };
};

export const loadPurchaseMetrics = async (
  db: D1Database,
  range: AnalyticsDateRange,
  catalog: CatalogMaps
): Promise<PurchaseMetrics> => {
  const normalizedRange = normalizeDateRange(range);
  const byProduct = new Map<string, PurchaseProductMetric>();
  let totalPurchases = 0;
  let totalOrders = 0;

  const productSql = `
    SELECT
      oi.product_id,
      SUM(COALESCE(oi.quantity, 0)) AS quantity_total,
      COUNT(DISTINCT o.id) AS order_count,
      p.id AS product_id_resolved,
      p.name AS product_name,
      p.category AS product_category,
      p.stripe_product_id AS product_stripe_id
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id OR p.stripe_product_id = oi.product_id OR p.stripe_price_id = oi.product_id
    WHERE date(o.created_at) >= date(?)
      AND date(o.created_at) <= date(?)
    GROUP BY oi.product_id, p.id, p.name, p.category, p.stripe_product_id;
  `;

  const { results: purchaseRows } = await db
    .prepare(productSql)
    .bind(normalizedRange.startDate, normalizedRange.endDate)
    .all<PurchaseRow>();

  (purchaseRows || []).forEach((row) => {
    const canonical = resolveCanonicalProduct(
      row.product_id_resolved || row.product_stripe_id || row.product_id,
      row.product_name,
      null,
      row.product_category,
      catalog
    );
    const purchases = Math.max(0, safeInt(row.quantity_total));
    const orders = Math.max(0, safeInt(row.order_count));
    totalPurchases += purchases;
    totalOrders += orders;
    const existing = byProduct.get(canonical.id);
    if (existing) {
      existing.purchases += purchases;
      existing.orders += orders;
      return;
    }
    byProduct.set(canonical.id, {
      canonicalProductId: canonical.id,
      name: canonical.name,
      category: canonical.category || CATEGORY_FALLBACK,
      purchases,
      orders,
    });
  });

  const dailySql = `
    SELECT
      date(o.created_at) AS day,
      SUM(COALESCE(oi.quantity, 0)) AS quantity_total,
      COUNT(DISTINCT o.id) AS order_count
    FROM orders o
    INNER JOIN order_items oi ON oi.order_id = o.id
    WHERE date(o.created_at) >= date(?)
      AND date(o.created_at) <= date(?)
    GROUP BY date(o.created_at)
    ORDER BY date(o.created_at) ASC;
  `;

  const { results: dailyRows } = await db
    .prepare(dailySql)
    .bind(normalizedRange.startDate, normalizedRange.endDate)
    .all<PurchaseDailyRow>();

  const dailyPurchases = new Map<string, number>();
  const dailyOrders = new Map<string, number>();
  (dailyRows || []).forEach((row) => {
    const day = (row.day || '').slice(0, 10);
    if (!day) return;
    dailyPurchases.set(day, Math.max(0, safeInt(row.quantity_total)));
    dailyOrders.set(day, Math.max(0, safeInt(row.order_count)));
  });

  const hourlySql = `
    SELECT
      strftime('%H', o.created_at) AS hour,
      SUM(COALESCE(oi.quantity, 0)) AS quantity_total,
      COUNT(DISTINCT o.id) AS order_count
    FROM orders o
    INNER JOIN order_items oi ON oi.order_id = o.id
    WHERE date(o.created_at) >= date(?)
      AND date(o.created_at) <= date(?)
    GROUP BY strftime('%H', o.created_at)
    ORDER BY strftime('%H', o.created_at) ASC;
  `;

  const { results: hourlyRows } = await db
    .prepare(hourlySql)
    .bind(normalizedRange.startDate, normalizedRange.endDate)
    .all<PurchaseHourlyRow>();

  const hourlyPurchases = new Map<string, number>();
  const hourlyOrders = new Map<string, number>();
  (hourlyRows || []).forEach((row) => {
    const hour = (row.hour || '').padStart(2, '0');
    if (!hour) return;
    hourlyPurchases.set(hour, Math.max(0, safeInt(row.quantity_total)));
    hourlyOrders.set(hour, Math.max(0, safeInt(row.order_count)));
  });

  return {
    totalPurchases,
    totalOrders,
    byProduct,
    dailyPurchases,
    dailyOrders,
    hourlyPurchases,
    hourlyOrders,
  };
};

export const loadMessageTypeCounts = async (
  db: D1Database,
  range: AnalyticsDateRange
): Promise<{ message: number; customOrder: number }> => {
  const normalizedRange = normalizeDateRange(range);
  const sql = `
    SELECT type, COUNT(*) AS count_total
    FROM messages
    WHERE date(created_at) >= date(?)
      AND date(created_at) <= date(?)
    GROUP BY type;
  `;
  const { results } = await db
    .prepare(sql)
    .bind(normalizedRange.startDate, normalizedRange.endDate)
    .all<MessageTypeRow>();

  let message = 0;
  let customOrder = 0;
  (results || []).forEach((row) => {
    const type = (row.type || '').trim().toLowerCase();
    const count = Math.max(0, safeInt(row.count_total));
    if (type === 'custom_order') {
      customOrder += count;
    } else {
      message += count;
    }
  });
  return { message, customOrder };
};
