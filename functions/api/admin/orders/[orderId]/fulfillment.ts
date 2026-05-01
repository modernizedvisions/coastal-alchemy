import { requireAdmin } from '../../../_lib/adminAuth';
import {
  ensureOrdersFulfillmentSchema,
  getOrderFulfillmentStatus,
  normalizeManualFulfillmentOverride,
  resolveOrderViewedAt,
  type D1Database,
} from '../../../_lib/orderFulfillment';

type OrderRow = {
  id: string;
  is_seen: number | null;
  seen_at: string | null;
  viewed_at: string | null;
  manual_fulfillment_override: string | null;
  shipping_label_created_at: string | null;
  fulfillment_shipped_at: string | null;
};

type ShipmentEvidenceRow = {
  has_shipping_label_evidence: number;
  latest_label_evidence_at: string | null;
};

const getOrderId = (request: Request): string | null => {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/admin\/orders\/([^/]+)\/fulfillment$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

export async function onRequestPost(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;

    const orderId = getOrderId(context.request);
    if (!orderId) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing orderId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    await ensureOrdersFulfillmentSchema(context.env.DB);

    const exists = await context.env.DB
      .prepare(`SELECT id FROM orders WHERE id = ? LIMIT 1;`)
      .bind(orderId)
      .first<{ id: string }>();
    if (!exists?.id) {
      return new Response(JSON.stringify({ ok: false, error: 'Order not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const body = (await context.request.json().catch(() => null)) as
      | { manualFulfillmentOverride?: unknown; markAsShipped?: unknown }
      | null;
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const hasOverrideInput = Object.prototype.hasOwnProperty.call(body, 'manualFulfillmentOverride');
    const normalizedOverride = hasOverrideInput
      ? normalizeManualFulfillmentOverride(body.manualFulfillmentOverride)
      : null;
    if (hasOverrideInput && normalizedOverride === undefined) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Invalid manualFulfillmentOverride',
          allowed: ['automatic', 'new_order', 'label_needed', 'label_created', 'shipped'],
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    }

    const markAsShipped = body.markAsShipped === true || normalizedOverride === 'shipped';
    if (!hasOverrideInput && !markAsShipped) {
      return new Response(JSON.stringify({ ok: false, error: 'No fulfillment changes requested' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    if (hasOverrideInput) {
      updates.push(`manual_fulfillment_override = ?`);
      values.push(normalizedOverride);
    }
    if (markAsShipped) {
      updates.push(`fulfillment_shipped_at = COALESCE(fulfillment_shipped_at, ?)`);
      values.push(new Date().toISOString());
    }
    values.push(orderId);

    await context.env.DB
      .prepare(
        `UPDATE orders
         SET ${updates.join(', ')}
         WHERE id = ?;`
      )
      .bind(...values)
      .run();

    const updated = await context.env.DB
      .prepare(
        `SELECT id, is_seen, seen_at, viewed_at, manual_fulfillment_override, shipping_label_created_at, fulfillment_shipped_at
         FROM orders
         WHERE id = ?
         LIMIT 1;`
      )
      .bind(orderId)
      .first<OrderRow>();

    const shipmentEvidence = await getShipmentEvidence(context.env.DB, orderId);
    const viewedAt = resolveOrderViewedAt(updated || {});
    const shippingLabelCreatedAt = updated?.shipping_label_created_at || shipmentEvidence?.latest_label_evidence_at || null;
    const hasShippingLabelEvidence = !!shippingLabelCreatedAt || (shipmentEvidence?.has_shipping_label_evidence ?? 0) === 1;
    const fulfillmentStatus = getOrderFulfillmentStatus({
      manual_fulfillment_override: updated?.manual_fulfillment_override ?? null,
      fulfillment_shipped_at: updated?.fulfillment_shipped_at ?? null,
      shipping_label_created_at: shippingLabelCreatedAt,
      viewed_at: viewedAt,
      seen_at: updated?.seen_at ?? null,
      is_seen: updated?.is_seen ?? null,
      has_shipping_label_evidence: hasShippingLabelEvidence ? 1 : 0,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        order: {
          id: updated?.id || orderId,
          isSeen: !!viewedAt || updated?.is_seen === 1,
          seenAt: viewedAt,
          viewedAt,
          manualFulfillmentOverride: updated?.manual_fulfillment_override ?? null,
          shippingLabelCreatedAt,
          fulfillmentShippedAt: updated?.fulfillment_shipped_at ?? null,
          hasShippingLabelEvidence,
          fulfillmentStatus,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  } catch (error) {
    console.error('[/api/admin/orders/:orderId/fulfillment] error', error);
    return new Response(JSON.stringify({ ok: false, error: 'Failed to update fulfillment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

async function getShipmentEvidence(db: D1Database, orderId: string): Promise<ShipmentEvidenceRow | null> {
  const shipmentTable = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'order_shipments' LIMIT 1;`)
    .first<{ name: string }>();
  if (!shipmentTable?.name) return null;
  return db
    .prepare(
      `
      SELECT
        MAX(CASE WHEN (
          label_state = 'generated'
          OR purchased_at IS NOT NULL
          OR label_url IS NOT NULL
          OR tracking_number IS NOT NULL
          OR easyship_label_id IS NOT NULL
          OR easyship_shipment_id IS NOT NULL
        ) THEN 1 ELSE 0 END) AS has_shipping_label_evidence,
        MAX(CASE WHEN (
          label_state = 'generated'
          OR purchased_at IS NOT NULL
          OR label_url IS NOT NULL
          OR tracking_number IS NOT NULL
          OR easyship_label_id IS NOT NULL
          OR easyship_shipment_id IS NOT NULL
        ) THEN COALESCE(purchased_at, updated_at, created_at) ELSE NULL END) AS latest_label_evidence_at
      FROM order_shipments
      WHERE order_id = ?;
      `
    )
    .bind(orderId)
    .first<ShipmentEvidenceRow>();
}
