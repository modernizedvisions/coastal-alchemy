import { requireAdmin } from '../_lib/adminAuth';
import { buildAnalyticsSnapshot } from '../_lib/analytics/service';
import { parseAnalyticsTimeframe } from '../_lib/analytics/timeframes';
import type { AnalyticsEnv } from '../_lib/analytics/ga4Client';
import type { D1Database } from '../_lib/analytics/db';

type AnalyticsRouteEnv = AnalyticsEnv & {
  DB: D1Database;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

export const onRequestGet = async (context: { request: Request; env: AnalyticsRouteEnv }): Promise<Response> => {
  try {
    const unauthorized = await requireAdmin(context.request, context.env);
    if (unauthorized) return unauthorized;

    const url = new URL(context.request.url);
    const timeframe = parseAnalyticsTimeframe(url.searchParams.get('timeframe'));

    const snapshot = await buildAnalyticsSnapshot({
      env: context.env,
      db: context.env.DB,
      timeframe,
    });

    return json({ snapshot });
  } catch (error) {
    console.error('[/api/admin/analytics] failed', error);
    const detail = error instanceof Error ? error.message : String(error);
    return json(
      {
        error: 'Failed to load analytics snapshot',
        detail,
      },
      500
    );
  }
};

