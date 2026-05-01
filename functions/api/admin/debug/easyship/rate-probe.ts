import { requireAdmin } from '../../../_lib/adminAuth';
import {
  fetchEasyshipRates,
  isEasyshipDebugEnabled,
  type EasyshipRateRequest,
} from '../../../_lib/easyship';
import {
  ensureShippingLabelsSchema,
  getOrderDestination,
  getOrderItemsForEasyship,
  getOrderShipment,
  hasRequiredDestination,
  jsonResponse,
  orderExists,
  readShippingSettings,
  resolveShipmentDimensions,
  type EasyshipOrderItem,
  validateShipFrom,
  type ShippingLabelsEnv,
} from '../../../_lib/shippingLabels';

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toEasyshipRateRequest = (
  shipFrom: Awaited<ReturnType<typeof readShippingSettings>>,
  destination: {
    name: string | null;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  },
  dimensions: NonNullable<ReturnType<typeof resolveShipmentDimensions>>,
  items: EasyshipOrderItem[]
): EasyshipRateRequest => ({
  origin: {
    name: shipFrom.shipFromName,
    companyName: shipFrom.shipFromCompany || 'Dover Designs',
    phone: shipFrom.shipFromPhone || null,
    addressLine1: shipFrom.shipFromAddress1,
    addressLine2: shipFrom.shipFromAddress2 || null,
    city: shipFrom.shipFromCity,
    state: shipFrom.shipFromState,
    postalCode: shipFrom.shipFromPostal,
    countryCode: shipFrom.shipFromCountry || 'US',
  },
  destination: {
    name: destination.name || 'Customer',
    companyName: destination.companyName || null,
    email: destination.email || null,
    phone: destination.phone || null,
    addressLine1: destination.line1 || '',
    addressLine2: destination.line2 || null,
    city: destination.city || '',
    state: destination.state || '',
    postalCode: destination.postalCode || '',
    countryCode: destination.country || 'US',
  },
  dimensions,
  items: items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    declaredValueCents: item.declaredValueCents,
  })),
});

const getCarrierNames = (rates: Array<{ carrier: string }>): string[] => rates.slice(0, 10).map((rate) => rate.carrier);

export async function onRequestPost(
  context: { request: Request; env: ShippingLabelsEnv & Record<string, string | undefined> }
): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env as any);
  if (unauthorized) return unauthorized;

  if (!isEasyshipDebugEnabled(context.env)) {
    return jsonResponse({ ok: false, error: 'Easyship debug endpoint is disabled.' }, 404);
  }

  const body = (await context.request.json().catch(() => null)) as Record<string, unknown> | null;
  const orderId = trimOrNull(body?.orderId);
  const shipmentId = trimOrNull(body?.shipmentId);
  if (!orderId || !shipmentId) {
    return jsonResponse({ ok: false, error: 'orderId and shipmentId are required.' }, 400);
  }

  try {
    await ensureShippingLabelsSchema(context.env.DB);
    if (!(await orderExists(context.env.DB, orderId))) {
      return jsonResponse({ ok: false, error: 'Order not found.' }, 404);
    }
    const shipment = await getOrderShipment(context.env.DB, orderId, shipmentId);
    if (!shipment) {
      return jsonResponse({ ok: false, error: 'Shipment not found.' }, 404);
    }

    const shipFrom = await readShippingSettings(context.env.DB);
    const missingShipFrom = validateShipFrom(shipFrom);
    if (missingShipFrom.length) {
      return jsonResponse(
        {
          ok: false,
          code: 'SHIP_FROM_INCOMPLETE',
          error: 'Ship-from settings are incomplete.',
          missing: missingShipFrom,
        },
        400
      );
    }

    const dimensions = resolveShipmentDimensions(shipment);
    if (!dimensions) {
      return jsonResponse(
        { ok: false, code: 'PARCEL_INCOMPLETE', error: 'Shipment is missing dimensions or weight.' },
        400
      );
    }

    const destination = await getOrderDestination(context.env.DB, orderId);
    if (!hasRequiredDestination(destination)) {
      return jsonResponse(
        { ok: false, code: 'DESTINATION_INCOMPLETE', error: 'Order shipping destination is incomplete.' },
        400
      );
    }

    const orderItems = await getOrderItemsForEasyship(context.env.DB, orderId);
    const realRequest = toEasyshipRateRequest(shipFrom, destination!, dimensions, orderItems);
    const probeRequest = toEasyshipRateRequest(
      shipFrom,
      {
        name: 'Rate Probe',
        companyName: null,
        email: null,
        phone: null,
        line1: '1 Main St',
        line2: null,
        city: 'Buffalo',
        state: 'NY',
        postalCode: '14201',
        country: 'US',
      },
      dimensions,
      orderItems
    );

    const [realResult, probeResult] = await Promise.all([
      fetchEasyshipRates(context.env, realRequest),
      fetchEasyshipRates(context.env, probeRequest),
    ]);

    return jsonResponse({
      ok: true,
      debugEnabled: true,
      orderId,
      shipmentId,
      parcelMetrics: {
        lengthIn: dimensions.lengthIn,
        widthIn: dimensions.widthIn,
        heightIn: dimensions.heightIn,
        weightLb: dimensions.weightLb,
      },
      realRatesCount: realResult.rates.length,
      realCarrierNames: getCarrierNames(realResult.rates),
      realWarning: realResult.warning,
      realRawResponseHints: realResult.rawResponseHints || null,
      probeRatesCount: probeResult.rates.length,
      probeCarrierNames: getCarrierNames(probeResult.rates),
      probeWarning: probeResult.warning,
      probeRawResponseHints: probeResult.rawResponseHints || null,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: 'Failed to run Easyship rate probe.', detail }, 500);
  }
}

export async function onRequest(
  context: { request: Request; env: ShippingLabelsEnv & Record<string, string | undefined> }
): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }
  return onRequestPost(context);
}
