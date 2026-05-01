import type { Product } from '../../../src/lib/types';
import { normalizeImageUrl } from '../_lib/images';
import {
  emptyProductVideo,
  getProductVideoByProductId,
  toProductVideoSummary,
} from '../_lib/productVideos';

type D1PreparedStatement = {
  run(): Promise<{ success: boolean; error?: string }>;
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type ProductRow = {
  id: string;
  name: string | null;
  slug?: string | null;
  description: string | null;
  price_cents: number | null;
  category: string | null;
  image_url: string | null;
  image_urls_json?: string | null;
  primary_image_id?: string | null;
  image_ids_json?: string | null;
  is_active: number | null;
  is_one_off?: number | null;
  is_sold?: number | null;
  quantity_available?: number | null;
  stripe_price_id?: string | null;
  stripe_product_id?: string | null;
  collection?: string | null;
  shipping_override_enabled?: number | null;
  shipping_override_amount_cents?: number | null;
  created_at: string | null;
};

const safeParseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

const mapRowToProduct = (
  row: ProductRow,
  request: Request,
  env: { PUBLIC_IMAGES_BASE_URL?: string },
  productVideo = emptyProductVideo()
): Product => {
  const rawImageUrls = row.image_urls_json ? safeParseJsonArray(row.image_urls_json) : [];
  const rawPrimary = row.image_url || rawImageUrls[0] || '';
  const primaryImage = normalizeImageUrl(rawPrimary, request, env);
  const imageUrls = rawImageUrls
    .map((url) => normalizeImageUrl(url, request, env))
    .filter(Boolean)
    .filter((url) => url !== primaryImage);
  const imageIds = row.image_ids_json ? safeParseJsonArray(row.image_ids_json) : [];

  return {
    id: row.id,
    stripeProductId: row.stripe_product_id || row.id,
    stripePriceId: row.stripe_price_id || undefined,
    name: row.name ?? '',
    description: row.description ?? '',
    imageUrls: primaryImage ? [primaryImage, ...imageUrls] : imageUrls,
    imageUrl: primaryImage || imageUrls[0] || '',
    thumbnailUrl: primaryImage || undefined,
    primaryImageId: row.primary_image_id || undefined,
    imageIds,
    type: row.category ?? 'General',
    category: row.category ?? undefined,
    categories: row.category ? [row.category] : undefined,
    collection: row.collection ?? row.category ?? undefined,
    oneoff: row.is_one_off === null ? true : row.is_one_off === 1,
    visible: row.is_active === null ? true : row.is_active === 1,
    isSold: row.is_sold === 1,
    priceCents: row.price_cents ?? undefined,
    soldAt: undefined,
    quantityAvailable: row.quantity_available ?? undefined,
    shippingOverrideEnabled: row.shipping_override_enabled === 1,
    shippingOverrideAmountCents:
      Number.isFinite(row.shipping_override_amount_cents as number) &&
      (row.shipping_override_amount_cents as number) >= 0
        ? Number(row.shipping_override_amount_cents)
        : null,
    slug: row.slug ?? undefined,
    productVideo,
  };
};

export async function onRequestGet(context: {
  env: { DB: D1Database };
  params: Record<string, string>;
}): Promise<Response> {
  const idOrSlug = context.params?.id;
  if (!idOrSlug) {
    return new Response(JSON.stringify({ error: 'Product id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await ensureProductSchema(context.env.DB);
    const row = await context.env.DB.prepare(
      `
      SELECT id, name, slug, description, price_cents, category, image_url, image_urls_json,
             primary_image_id, image_ids_json, is_active,
             is_one_off, is_sold, quantity_available, stripe_price_id, stripe_product_id, collection,
             shipping_override_enabled, shipping_override_amount_cents, created_at
      FROM products
      WHERE id = ? OR slug = ? OR stripe_product_id = ?
      LIMIT 1;
    `
    )
      .bind(idOrSlug, idOrSlug, idOrSlug)
      .first<ProductRow>();

    if (!row) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const videoRow = await getProductVideoByProductId(context.env.DB, row.id);
    const product = mapRowToProduct(
      row,
      context.request,
      context.env,
      toProductVideoSummary(videoRow)
    );
    return new Response(JSON.stringify({ product }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to load product', error);
    return new Response(JSON.stringify({ error: 'Failed to load product' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

const REQUIRED_PRODUCT_COLUMNS: Record<string, string> = {
  image_urls_json: 'image_urls_json TEXT',
  primary_image_id: 'primary_image_id TEXT',
  image_ids_json: 'image_ids_json TEXT',
  is_one_off: 'is_one_off INTEGER DEFAULT 1',
  is_sold: 'is_sold INTEGER DEFAULT 0',
  quantity_available: 'quantity_available INTEGER DEFAULT 1',
  stripe_price_id: 'stripe_price_id TEXT',
  stripe_product_id: 'stripe_product_id TEXT',
  collection: 'collection TEXT',
  shipping_override_enabled: 'shipping_override_enabled INTEGER NOT NULL DEFAULT 0',
  shipping_override_amount_cents: 'shipping_override_amount_cents INTEGER',
};

const createProductsTable = `
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT,
    slug TEXT,
    description TEXT,
    price_cents INTEGER,
    category TEXT,
    image_url TEXT,
    image_urls_json TEXT,
    primary_image_id TEXT,
    image_ids_json TEXT,
    is_active INTEGER DEFAULT 1,
    is_one_off INTEGER DEFAULT 1,
    is_sold INTEGER DEFAULT 0,
    quantity_available INTEGER DEFAULT 1,
    stripe_price_id TEXT,
    stripe_product_id TEXT,
    collection TEXT,
    shipping_override_enabled INTEGER NOT NULL DEFAULT 0,
    shipping_override_amount_cents INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

async function ensureProductSchema(_db: D1Database) {
  return;
}


