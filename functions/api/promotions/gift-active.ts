import {
  fetchActiveGiftPromotionRow,
  hydrateGiftPromotions,
  type D1Database,
} from '../_lib/giftPromotions';

const json = (data: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
  });

export const onRequestGet = async (context: { env: { DB: D1Database }; request: Request }) => {
  try {
    const row = await fetchActiveGiftPromotionRow(context.env.DB);
    if (!row) {
      return json({ giftPromotion: null }, 200, { 'Cache-Control': 'public, max-age=60' });
    }

    const [giftPromotion] = await hydrateGiftPromotions(context.env.DB, [row], context.request, context.env);
    return json({ giftPromotion: giftPromotion || null }, 200, { 'Cache-Control': 'public, max-age=60' });
  } catch (error) {
    console.error('Failed to load active gift promotion', error);
    return json({ giftPromotion: null }, 200, { 'Cache-Control': 'public, max-age=60' });
  }
};