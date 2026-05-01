import { adminFetch } from './adminAuth';
import type { OrderManualFulfillmentOverride, OrderFulfillmentStatus } from './orderFulfillment';

type OrderFulfillmentApiOrder = {
  id: string;
  isSeen: boolean;
  seenAt: string | null;
  viewedAt: string | null;
  manualFulfillmentOverride: OrderManualFulfillmentOverride;
  shippingLabelCreatedAt: string | null;
  fulfillmentShippedAt: string | null;
  hasShippingLabelEvidence: boolean;
  fulfillmentStatus: OrderFulfillmentStatus;
};

export async function adminMarkOrderViewed(orderId: string): Promise<{
  unseenCount: number;
  viewedAt: string | null;
  isSeen: boolean;
}> {
  const response = await adminFetch('/api/admin/orders/seen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ id: orderId }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to mark order as viewed');
  }
  const data = (await response.json().catch(() => null)) as
    | { unseenCount?: number; viewedAt?: string | null; isSeen?: boolean }
    | null;
  return {
    unseenCount: typeof data?.unseenCount === 'number' ? data.unseenCount : 0,
    viewedAt: data?.viewedAt ?? null,
    isSeen: data?.isSeen === true,
  };
}

export async function adminUpdateOrderFulfillment(
  orderId: string,
  payload: {
    manualFulfillmentOverride?: OrderManualFulfillmentOverride | 'automatic';
    markAsShipped?: boolean;
  }
): Promise<OrderFulfillmentApiOrder> {
  const response = await adminFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/fulfillment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to update order fulfillment');
  }
  const data = (await response.json().catch(() => null)) as { order?: OrderFulfillmentApiOrder } | null;
  if (!data?.order) {
    throw new Error('Fulfillment update response was invalid');
  }
  return data.order;
}
