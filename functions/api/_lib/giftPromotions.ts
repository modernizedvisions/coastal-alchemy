import { normalizeImageUrl, resolveImageIdsToUrls } from './images';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
};

export type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

export type GiftPromotionsEnv = {
  PUBLIC_IMAGES_BASE_URL?: string;
};

export type GiftPromotionRow = {
  id: string;
  name: string | null;
  enabled: number | null;
  starts_at: string | null;
  ends_at: string | null;
  threshold_subtotal_cents: number | null;
  gift_product_id: string | null;
  gift_quantity: number | null;
  banner_enabled: number | null;
  banner_text: string | null;
  popup_enabled: number | null;
  popup_title: string | null;
  popup_description: string | null;
  popup_button_text: string | null;
  popup_redirect: string | null;
  popup_image_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type GiftProductRow = {
  id: string;
  name: string | null;
  description: string | null;
  category: string | null;
  image_url: string | null;
  image_urls_json: string | null;
  primary_image_id: string | null;
  image_ids_json: string | null;
  is_active: number | null;
  collection: string | null;
  created_at: string | null;
};

export type GiftProductSummary = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  imageUrls: string[];
  category: string | null;
  categories: string[];
  isActive: boolean;
  collection?: string | null;
  createdAt?: string | null;
};

export type GiftPromotionRecord = {
  id: string;
  name: string;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  thresholdSubtotalCents: number;
  giftProductId: string;
  giftQuantity: number;
  bannerEnabled: boolean;
  bannerText: string;
  popupEnabled: boolean;
  popupTitle: string;
  popupDescription: string;
  popupButtonText: string;
  popupRedirect: string;
  popupImageId: string | null;
  popupImageUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  giftProduct: GiftProductSummary | null;
};

const LOOKUP_CHUNK_SIZE = 200;

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (!Array.isArray(items) || !items.length) return [];
  const chunkSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : 1;
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const safeParseStringArray = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean);
  } catch {
    return [];
  }
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  values.forEach((value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    ordered.push(trimmed);
  });
  return ordered;
};

const mapGiftPromotionBase = (row: GiftPromotionRow): Omit<GiftPromotionRecord, 'popupImageUrl' | 'giftProduct'> => ({
  id: row.id,
  name: row.name || '',
  enabled: row.enabled === 1,
  startsAt: row.starts_at || null,
  endsAt: row.ends_at || null,
  thresholdSubtotalCents: Math.max(0, Number(row.threshold_subtotal_cents || 0)),
  giftProductId: row.gift_product_id || '',
  giftQuantity: Math.max(1, Number(row.gift_quantity || 1)),
  bannerEnabled: row.banner_enabled === 1,
  bannerText: row.banner_text || '',
  popupEnabled: row.popup_enabled === 1,
  popupTitle: row.popup_title || '',
  popupDescription: row.popup_description || '',
  popupButtonText: row.popup_button_text || '',
  popupRedirect: row.popup_redirect || '',
  popupImageId: row.popup_image_id || null,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
});

const mapGiftProductSummaries = async (
  db: D1Database,
  productIds: string[],
  request?: Request,
  env?: GiftPromotionsEnv
): Promise<Map<string, GiftProductSummary>> => {
  const map = new Map<string, GiftProductSummary>();
  const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
  if (!uniqueIds.length) return map;

  const rows: GiftProductRow[] = [];
  for (const chunk of chunkArray(uniqueIds, LOOKUP_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => '?').join(', ');
    const { results } = await db
      .prepare(
        `SELECT id, name, description, category, image_url, image_urls_json, primary_image_id, image_ids_json, is_active, collection, created_at
         FROM products
         WHERE id IN (${placeholders});`
      )
      .bind(...chunk)
      .all<GiftProductRow>();
    rows.push(...(results || []));
  }

  const allImageIds = uniqueStrings(
    rows.flatMap((row) => [row.primary_image_id, ...safeParseStringArray(row.image_ids_json)])
  );
  const imageIdMap = allImageIds.length ? await resolveImageIdsToUrls(db, allImageIds, request, env) : new Map<string, string>();

  rows.forEach((row) => {
    const rawUrlList = safeParseStringArray(row.image_urls_json);
    const idUrls = safeParseStringArray(row.image_ids_json)
      .map((id) => imageIdMap.get(id) || '')
      .filter(Boolean);
    const primaryFromId = row.primary_image_id ? imageIdMap.get(row.primary_image_id) || '' : '';
    const primaryCandidate = normalizeImageUrl(row.image_url || primaryFromId || rawUrlList[0] || '', request, env);
    const normalizedExtras = uniqueStrings(
      [...rawUrlList, ...idUrls]
        .map((url) => normalizeImageUrl(url, request, env))
        .filter(Boolean)
    );

    const orderedImages = uniqueStrings([primaryCandidate, ...normalizedExtras]);

    map.set(row.id, {
      id: row.id,
      name: row.name || 'Gift Item',
      description: row.description || '',
      imageUrl: orderedImages[0] || '',
      imageUrls: orderedImages,
      category: row.category || null,
      categories: row.category ? [row.category] : [],
      isActive: row.is_active === 1,
      collection: row.collection || null,
      createdAt: row.created_at || null,
    });
  });

  return map;
};

export const withinScheduleWindow = (nowMs: number, startsAt?: string | null, endsAt?: string | null): boolean => {
  if (startsAt) {
    const startMs = Date.parse(startsAt);
    if (!Number.isFinite(startMs) || nowMs < startMs) return false;
  }
  if (endsAt) {
    const endMs = Date.parse(endsAt);
    if (!Number.isFinite(endMs) || nowMs > endMs) return false;
  }
  return true;
};

export async function ensureGiftPromotionsSchema(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS gift_promotions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        starts_at TEXT,
        ends_at TEXT,
        threshold_subtotal_cents INTEGER NOT NULL,
        gift_product_id TEXT NOT NULL,
        gift_quantity INTEGER NOT NULL DEFAULT 1,
        banner_enabled INTEGER NOT NULL DEFAULT 0,
        banner_text TEXT NOT NULL DEFAULT '',
        popup_enabled INTEGER NOT NULL DEFAULT 0,
        popup_title TEXT NOT NULL DEFAULT '',
        popup_description TEXT NOT NULL DEFAULT '',
        popup_button_text TEXT NOT NULL DEFAULT '',
        popup_redirect TEXT NOT NULL DEFAULT '',
        popup_image_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );`
    )
    .run();

  const columns = await db.prepare(`PRAGMA table_info(gift_promotions);`).all<{ name: string }>();
  const existing = new Set((columns.results || []).map((row) => row.name));
  const requiredColumns: Record<string, string> = {
    enabled: 'enabled INTEGER NOT NULL DEFAULT 0',
    starts_at: 'starts_at TEXT',
    ends_at: 'ends_at TEXT',
    threshold_subtotal_cents: 'threshold_subtotal_cents INTEGER NOT NULL DEFAULT 1',
    gift_product_id: "gift_product_id TEXT NOT NULL DEFAULT ''",
    gift_quantity: 'gift_quantity INTEGER NOT NULL DEFAULT 1',
    banner_enabled: 'banner_enabled INTEGER NOT NULL DEFAULT 0',
    banner_text: "banner_text TEXT NOT NULL DEFAULT ''",
    popup_enabled: 'popup_enabled INTEGER NOT NULL DEFAULT 0',
    popup_title: "popup_title TEXT NOT NULL DEFAULT ''",
    popup_description: "popup_description TEXT NOT NULL DEFAULT ''",
    popup_button_text: "popup_button_text TEXT NOT NULL DEFAULT ''",
    popup_redirect: "popup_redirect TEXT NOT NULL DEFAULT ''",
    popup_image_id: 'popup_image_id TEXT',
    updated_at: "updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
  };

  for (const [columnName, ddl] of Object.entries(requiredColumns)) {
    if (existing.has(columnName)) continue;
    try {
      await db.prepare(`ALTER TABLE gift_promotions ADD COLUMN ${ddl};`).run();
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!/duplicate column|already exists/i.test(message)) {
        throw error;
      }
    }
  }

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_gift_promotions_enabled ON gift_promotions(enabled);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_gift_promotions_updated_at ON gift_promotions(updated_at);`).run();
}

export async function ensureOrdersGiftColumns(db: D1Database): Promise<void> {
  const columns = await db.prepare(`PRAGMA table_info(orders);`).all<{ name: string }>();
  const existing = new Set((columns.results || []).map((row) => row.name));

  if (!existing.has('gift_promotion_id')) {
    await db.prepare(`ALTER TABLE orders ADD COLUMN gift_promotion_id TEXT;`).run();
  }
  if (!existing.has('gift_product_id')) {
    await db.prepare(`ALTER TABLE orders ADD COLUMN gift_product_id TEXT;`).run();
  }
  if (!existing.has('gift_quantity')) {
    await db.prepare(`ALTER TABLE orders ADD COLUMN gift_quantity INTEGER;`).run();
  }
}

export async function fetchActiveGiftPromotionRow(
  db: D1Database,
  nowIso = new Date().toISOString()
): Promise<GiftPromotionRow | null> {
  await ensureGiftPromotionsSchema(db);
  return db
    .prepare(
      `SELECT id, name, enabled, starts_at, ends_at, threshold_subtotal_cents, gift_product_id, gift_quantity,
              banner_enabled, banner_text, popup_enabled, popup_title, popup_description, popup_button_text,
              popup_redirect, popup_image_id, created_at, updated_at
       FROM gift_promotions
       WHERE enabled = 1
         AND (starts_at IS NULL OR starts_at <= ?)
         AND (ends_at IS NULL OR ends_at >= ?)
       ORDER BY updated_at DESC
       LIMIT 1;`
    )
    .bind(nowIso, nowIso)
    .first<GiftPromotionRow>();
}

export async function hydrateGiftPromotions(
  db: D1Database,
  rows: GiftPromotionRow[],
  request?: Request,
  env?: GiftPromotionsEnv
): Promise<GiftPromotionRecord[]> {
  if (!rows.length) return [];

  const popupImageIds = uniqueStrings(rows.map((row) => row.popup_image_id));
  const popupImageMap = popupImageIds.length
    ? await resolveImageIdsToUrls(db, popupImageIds, request, env)
    : new Map<string, string>();

  const productIds = uniqueStrings(rows.map((row) => row.gift_product_id));
  const productMap = await mapGiftProductSummaries(db, productIds, request, env);

  return rows.map((row) => {
    const base = mapGiftPromotionBase(row);
    return {
      ...base,
      popupImageUrl: base.popupImageId ? popupImageMap.get(base.popupImageId) || null : null,
      giftProduct: base.giftProductId ? productMap.get(base.giftProductId) || null : null,
    };
  });
}