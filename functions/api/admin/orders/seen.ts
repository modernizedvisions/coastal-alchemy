import { requireAdmin } from '../../_lib/adminAuth';
import {
  countUnviewedOrders,
  ensureOrdersFulfillmentSchema,
  markOrderViewed,
  type D1Database,
} from '../../_lib/orderFulfillment';

export async function onRequestPost(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;

    await ensureOrdersFulfillmentSchema(context.env.DB);
    const body = (await context.request.json().catch(() => null)) as { id?: string } | null;
    const id = body?.id?.trim();
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    await markOrderViewed(context.env.DB, id);
    const order = await context.env.DB
      .prepare(`SELECT viewed_at, seen_at, is_seen FROM orders WHERE id = ? LIMIT 1;`)
      .bind(id)
      .first<{ viewed_at: string | null; seen_at: string | null; is_seen: number | null }>();
    const viewedAt = order?.viewed_at || order?.seen_at || null;
    const unseenCount = await countUnviewedOrders(context.env.DB);

    return new Response(JSON.stringify({ success: true, unseenCount, viewedAt, isSeen: !!viewedAt || order?.is_seen === 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('[/api/admin/orders/seen] error', err);
    return new Response(JSON.stringify({ error: 'Failed to update order' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
