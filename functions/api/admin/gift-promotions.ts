import { requireAdmin } from '../_lib/adminAuth';
import {
  ensureGiftPromotionsSchema,
  hydrateGiftPromotions,
  type D1Database,
  type GiftPromotionRow,
} from '../_lib/giftPromotions';

type GiftPromotionInput = {
  name?: string;
  enabled?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  thresholdSubtotalCents?: number;
  giftProductId?: string;
  giftQuantity?: number;
  bannerEnabled?: boolean;
  bannerText?: string;
  popupEnabled?: boolean;
  popupTitle?: string;
  popupDescription?: string;
  popupButtonText?: string;
  popupRedirect?: string;
  popupImageId?: string | null;
};

type NormalizedGiftPromotionInput = {
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
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeRequiredString = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const parseDateInput = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
};

const mapRowToNormalizedInput = (row: GiftPromotionRow): NormalizedGiftPromotionInput => ({
  name: row.name || '',
  enabled: row.enabled === 1,
  startsAt: row.starts_at || null,
  endsAt: row.ends_at || null,
  thresholdSubtotalCents: Math.max(1, Number(row.threshold_subtotal_cents || 1)),
  giftProductId: (row.gift_product_id || '').trim(),
  giftQuantity: Math.max(1, Number(row.gift_quantity || 1)),
  bannerEnabled: row.banner_enabled === 1,
  bannerText: row.banner_text || '',
  popupEnabled: row.popup_enabled === 1,
  popupTitle: row.popup_title || '',
  popupDescription: row.popup_description || '',
  popupButtonText: row.popup_button_text || '',
  popupRedirect: row.popup_redirect || '',
  popupImageId: row.popup_image_id || null,
});

const normalizeCreateInput = (input: GiftPromotionInput): { normalized?: NormalizedGiftPromotionInput; error?: string } => {
  const name = normalizeRequiredString(input.name);
  const thresholdRaw = Number(input.thresholdSubtotalCents);
  const thresholdSubtotalCents = Math.floor(thresholdRaw);
  const giftProductId = normalizeRequiredString(input.giftProductId);
  const giftQuantity = Math.max(1, Math.floor(Number(input.giftQuantity ?? 1)));
  const startsAt = parseDateInput(input.startsAt ?? null);
  const endsAt = parseDateInput(input.endsAt ?? null);
  const bannerEnabled = input.bannerEnabled === true;
  const bannerText = normalizeRequiredString(input.bannerText);
  const popupEnabled = input.popupEnabled === true;
  const popupTitle = normalizeRequiredString(input.popupTitle);
  const popupDescription = normalizeRequiredString(input.popupDescription);
  const popupButtonText = normalizeRequiredString(input.popupButtonText);
  const popupRedirect = normalizeRequiredString(input.popupRedirect);
  const popupImageId = normalizeOptionalString(input.popupImageId);
  const enabled = input.enabled === true;

  if (!name) return { error: 'name is required' };
  if (!Number.isFinite(thresholdSubtotalCents) || thresholdSubtotalCents < 1) {
    return { error: 'thresholdSubtotalCents must be >= 1' };
  }
  if (!giftProductId) return { error: 'giftProductId is required' };
  if (bannerEnabled && !bannerText) return { error: 'bannerText is required when bannerEnabled is true' };

  if (input.startsAt && !startsAt) return { error: 'Invalid startsAt value' };
  if (input.endsAt && !endsAt) return { error: 'Invalid endsAt value' };
  if (startsAt && endsAt && Date.parse(startsAt) > Date.parse(endsAt)) {
    return { error: 'Start date must be before end date' };
  }

  if (popupEnabled) {
    if (!popupTitle) return { error: 'popupTitle is required when popupEnabled is true' };
    if (!popupDescription) return { error: 'popupDescription is required when popupEnabled is true' };
    if (!popupButtonText) return { error: 'popupButtonText is required when popupEnabled is true' };
    if (!popupRedirect) return { error: 'popupRedirect is required when popupEnabled is true' };
  }

  return {
    normalized: {
      name,
      enabled,
      startsAt,
      endsAt,
      thresholdSubtotalCents,
      giftProductId,
      giftQuantity,
      bannerEnabled,
      bannerText,
      popupEnabled,
      popupTitle,
      popupDescription,
      popupButtonText,
      popupRedirect,
      popupImageId,
    },
  };
};

const normalizeUpdateInput = (
  row: GiftPromotionRow,
  input: GiftPromotionInput
): { normalized?: NormalizedGiftPromotionInput; error?: string } => {
  const baseline = mapRowToNormalizedInput(row);

  const merged: GiftPromotionInput = {
    name: input.name ?? baseline.name,
    enabled: input.enabled ?? baseline.enabled,
    startsAt: input.startsAt !== undefined ? input.startsAt : baseline.startsAt,
    endsAt: input.endsAt !== undefined ? input.endsAt : baseline.endsAt,
    thresholdSubtotalCents:
      input.thresholdSubtotalCents !== undefined ? input.thresholdSubtotalCents : baseline.thresholdSubtotalCents,
    giftProductId: input.giftProductId ?? baseline.giftProductId,
    giftQuantity: input.giftQuantity !== undefined ? input.giftQuantity : baseline.giftQuantity,
    bannerEnabled: input.bannerEnabled ?? baseline.bannerEnabled,
    bannerText: input.bannerText !== undefined ? input.bannerText : baseline.bannerText,
    popupEnabled: input.popupEnabled ?? baseline.popupEnabled,
    popupTitle: input.popupTitle !== undefined ? input.popupTitle : baseline.popupTitle,
    popupDescription: input.popupDescription !== undefined ? input.popupDescription : baseline.popupDescription,
    popupButtonText: input.popupButtonText !== undefined ? input.popupButtonText : baseline.popupButtonText,
    popupRedirect: input.popupRedirect !== undefined ? input.popupRedirect : baseline.popupRedirect,
    popupImageId: input.popupImageId !== undefined ? input.popupImageId : baseline.popupImageId,
  };

  return normalizeCreateInput(merged);
};

const fetchById = async (db: D1Database, id: string): Promise<GiftPromotionRow | null> =>
  db
    .prepare(
      `SELECT id, name, enabled, starts_at, ends_at, threshold_subtotal_cents, gift_product_id, gift_quantity,
              banner_enabled, banner_text, popup_enabled, popup_title, popup_description, popup_button_text,
              popup_redirect, popup_image_id, created_at, updated_at
       FROM gift_promotions
       WHERE id = ?
       LIMIT 1;`
    )
    .bind(id)
    .first<GiftPromotionRow>();

const productExists = async (db: D1Database, id: string): Promise<boolean> => {
  const row = await db
    .prepare(`SELECT id FROM products WHERE id = ? LIMIT 1;`)
    .bind(id)
    .first<{ id: string }>();
  return !!row?.id;
};

export async function onRequest(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  const unauthorized = await requireAdmin(request, env as any);
  if (unauthorized) return unauthorized;

  try {
    await ensureGiftPromotionsSchema(env.DB);

    if (method === 'GET') {
      const { results } = await env.DB
        .prepare(
          `SELECT id, name, enabled, starts_at, ends_at, threshold_subtotal_cents, gift_product_id, gift_quantity,
                  banner_enabled, banner_text, popup_enabled, popup_title, popup_description, popup_button_text,
                  popup_redirect, popup_image_id, created_at, updated_at
           FROM gift_promotions
           ORDER BY updated_at DESC;`
        )
        .all<GiftPromotionRow>();

      const giftPromotions = await hydrateGiftPromotions(env.DB, results || [], request, env);
      return json({ giftPromotions });
    }

    if (method === 'POST') {
      const body = (await request.json().catch(() => null)) as GiftPromotionInput | null;
      if (!body) return json({ error: 'Invalid JSON' }, 400);

      const { normalized, error } = normalizeCreateInput(body);
      if (!normalized) return json({ error: error || 'Invalid payload' }, 400);
      if (!(await productExists(env.DB, normalized.giftProductId))) {
        return json({ error: 'giftProductId must reference an existing product' }, 400);
      }

      if (normalized.enabled) {
        await env.DB.prepare(`UPDATE gift_promotions SET enabled = 0, updated_at = ? WHERE enabled = 1;`).bind(new Date().toISOString()).run();
      }

      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const insert = await env.DB
        .prepare(
          `INSERT INTO gift_promotions (
            id, name, enabled, starts_at, ends_at, threshold_subtotal_cents, gift_product_id, gift_quantity,
            banner_enabled, banner_text, popup_enabled, popup_title, popup_description, popup_button_text,
            popup_redirect, popup_image_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
        )
        .bind(
          id,
          normalized.name,
          normalized.enabled ? 1 : 0,
          normalized.startsAt,
          normalized.endsAt,
          normalized.thresholdSubtotalCents,
          normalized.giftProductId,
          normalized.giftQuantity,
          normalized.bannerEnabled ? 1 : 0,
          normalized.bannerText,
          normalized.popupEnabled ? 1 : 0,
          normalized.popupTitle,
          normalized.popupDescription,
          normalized.popupButtonText,
          normalized.popupRedirect,
          normalized.popupImageId,
          nowIso,
          nowIso
        )
        .run();

      if (!insert.success) {
        return json({ error: insert.error || 'Failed to create gift promotion' }, 500);
      }

      const created = await fetchById(env.DB, id);
      const [promotion] = created
        ? await hydrateGiftPromotions(env.DB, [created], request, env)
        : [];

      return json({ giftPromotion: promotion || null }, 201);
    }

    if (method === 'PUT') {
      const url = new URL(request.url);
      const id = normalizeOptionalString(url.searchParams.get('id'));
      if (!id) return json({ error: 'id is required' }, 400);

      const existing = await fetchById(env.DB, id);
      if (!existing) return json({ error: 'Gift promotion not found' }, 404);

      const body = (await request.json().catch(() => null)) as GiftPromotionInput | null;
      if (!body) return json({ error: 'Invalid JSON' }, 400);

      const { normalized, error } = normalizeUpdateInput(existing, body);
      if (!normalized) return json({ error: error || 'Invalid payload' }, 400);
      if (!(await productExists(env.DB, normalized.giftProductId))) {
        return json({ error: 'giftProductId must reference an existing product' }, 400);
      }

      if (normalized.enabled) {
        await env.DB
          .prepare(`UPDATE gift_promotions SET enabled = 0, updated_at = ? WHERE enabled = 1 AND id != ?;`)
          .bind(new Date().toISOString(), id)
          .run();
      }

      const updatedAt = new Date().toISOString();
      const update = await env.DB
        .prepare(
          `UPDATE gift_promotions
           SET name = ?, enabled = ?, starts_at = ?, ends_at = ?, threshold_subtotal_cents = ?,
               gift_product_id = ?, gift_quantity = ?, banner_enabled = ?, banner_text = ?,
               popup_enabled = ?, popup_title = ?, popup_description = ?, popup_button_text = ?,
               popup_redirect = ?, popup_image_id = ?, updated_at = ?
           WHERE id = ?;`
        )
        .bind(
          normalized.name,
          normalized.enabled ? 1 : 0,
          normalized.startsAt,
          normalized.endsAt,
          normalized.thresholdSubtotalCents,
          normalized.giftProductId,
          normalized.giftQuantity,
          normalized.bannerEnabled ? 1 : 0,
          normalized.bannerText,
          normalized.popupEnabled ? 1 : 0,
          normalized.popupTitle,
          normalized.popupDescription,
          normalized.popupButtonText,
          normalized.popupRedirect,
          normalized.popupImageId,
          updatedAt,
          id
        )
        .run();

      if (!update.success) return json({ error: update.error || 'Failed to update gift promotion' }, 500);
      if (update.meta?.changes === 0) return json({ error: 'Gift promotion not found' }, 404);

      const updated = await fetchById(env.DB, id);
      const [promotion] = updated
        ? await hydrateGiftPromotions(env.DB, [updated], request, env)
        : [];

      return json({ giftPromotion: promotion || null });
    }

    if (method === 'DELETE') {
      const url = new URL(request.url);
      const id = normalizeOptionalString(url.searchParams.get('id'));
      if (!id) return json({ error: 'id is required' }, 400);

      const deleted = await env.DB.prepare(`DELETE FROM gift_promotions WHERE id = ?;`).bind(id).run();
      if (!deleted.success) return json({ error: deleted.error || 'Failed to delete gift promotion' }, 500);
      if ((deleted.meta?.changes || 0) === 0) return json({ error: 'Gift promotion not found' }, 404);

      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Admin gift promotions error', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
