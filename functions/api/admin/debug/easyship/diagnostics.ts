import { requireAdmin } from '../../../_lib/adminAuth';
import {
  getAllowedCarriers,
  isEasyshipDebugEnabled,
  requestEasyshipDebug,
} from '../../../_lib/easyship';
import { jsonResponse, type ShippingLabelsEnv } from '../../../_lib/shippingLabels';

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toCourierName = (entry: Record<string, unknown>): string | null =>
  trimOrNull(entry.courier_name) ||
  trimOrNull(entry.name) ||
  trimOrNull(entry.carrier) ||
  trimOrNull(entry.provider) ||
  trimOrNull(entry.service_name) ||
  null;

const toCourierId = (entry: Record<string, unknown>): string | null =>
  trimOrNull(entry.id) || trimOrNull(entry.courier_id) || trimOrNull(entry.courier_service_id) || null;

const extractCouriers = (data: unknown): Array<{ id: string | null; name: string }> => {
  const source =
    (Array.isArray((data as any)?.couriers) && (data as any).couriers) ||
    (Array.isArray((data as any)?.courier_services) && (data as any).courier_services) ||
    (Array.isArray((data as any)?.data?.couriers) && (data as any).data.couriers) ||
    (Array.isArray((data as any)?.data?.courier_services) && (data as any).data.courier_services) ||
    [];

  const seen = new Set<string>();
  const output: Array<{ id: string | null; name: string }> = [];
  for (const raw of source) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const name = toCourierName(entry);
    if (!name) continue;
    const id = toCourierId(entry);
    const key = `${name}::${id || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ id, name });
  }
  return output;
};

export async function onRequestGet(
  context: { request: Request; env: ShippingLabelsEnv & Record<string, string | undefined> }
): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  if (!isEasyshipDebugEnabled(context.env)) {
    return jsonResponse({ ok: false, error: 'Easyship debug endpoint is disabled.' }, 404);
  }

  try {
    const token = trimOrNull(context.env.EASYSHIP_TOKEN);
    const attempts: Array<{ path: string; ok: boolean; status: number; errorCode: string | null }> = [];

    const tryPaths = ['/couriers', '/courier_services'];
    let selected:
      | {
          path: string;
          result: Awaited<ReturnType<typeof requestEasyshipDebug>>;
          couriers: Array<{ id: string | null; name: string }>;
        }
      | null = null;

    for (const path of tryPaths) {
      const result = await requestEasyshipDebug(context.env, path, 'GET');
      const couriers = extractCouriers(result.data);
      attempts.push({
        path,
        ok: result.ok,
        status: result.status,
        errorCode: result.errorCode,
      });
      if (result.ok && couriers.length > 0) {
        selected = { path, result, couriers };
        break;
      }
    }

    let fallbackResult: Awaited<ReturnType<typeof requestEasyshipDebug>> | null = null;
    if (!selected) {
      fallbackResult = await requestEasyshipDebug(context.env, '/shipments?per_page=1', 'GET');
      attempts.push({
        path: '/shipments?per_page=1',
        ok: fallbackResult.ok,
        status: fallbackResult.status,
        errorCode: fallbackResult.errorCode,
      });
    }

    return jsonResponse({
      ok: true,
      debugEnabled: true,
      tokenLength: token ? token.length : 0,
      allowedCarriers: getAllowedCarriers(context.env),
      courierCount: selected ? selected.couriers.length : 0,
      couriers: selected ? selected.couriers.slice(0, 25) : [],
      endpointUsed: selected
        ? {
            host: selected.result.endpoint.host,
            path: selected.result.endpoint.path,
          }
        : fallbackResult
        ? {
            host: fallbackResult.endpoint.host,
            path: fallbackResult.endpoint.path,
          }
        : null,
      warning: selected?.result.warning || fallbackResult?.warning || null,
      message: selected?.result.message || fallbackResult?.message || null,
      hasError: selected?.result.hasError ?? fallbackResult?.hasError ?? false,
      errorCode: selected?.result.errorCode || fallbackResult?.errorCode || null,
      attempts,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to run Easyship diagnostics.', detail }, 500);
  }
}

export async function onRequest(
  context: { request: Request; env: ShippingLabelsEnv & Record<string, string | undefined> }
): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'GET') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }
  return onRequestGet(context);
}

