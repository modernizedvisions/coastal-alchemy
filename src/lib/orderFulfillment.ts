export const ORDER_FULFILLMENT_STATUSES = [
  'new_order',
  'label_needed',
  'label_created',
  'shipped',
] as const;

export type OrderFulfillmentStatus = (typeof ORDER_FULFILLMENT_STATUSES)[number];
export type OrderManualFulfillmentOverride = OrderFulfillmentStatus | null;

export const ORDER_FULFILLMENT_LABELS: Record<OrderFulfillmentStatus, string> = {
  new_order: 'New Order',
  label_needed: 'Label Needed',
  label_created: 'Label Created',
  shipped: 'Shipped',
};

type FulfillmentOrderShape = {
  manualFulfillmentOverride?: string | null;
  fulfillmentShippedAt?: string | null;
  shippingLabelCreatedAt?: string | null;
  hasShippingLabelEvidence?: boolean | null;
  viewedAt?: string | null;
  seenAt?: string | null;
  isSeen?: boolean | null;
};

const isFulfillmentStatus = (value: unknown): value is OrderFulfillmentStatus =>
  typeof value === 'string' && (ORDER_FULFILLMENT_STATUSES as readonly string[]).includes(value);

const hasShippingLabelEvidence = (order: FulfillmentOrderShape): boolean =>
  !!order.shippingLabelCreatedAt || order.hasShippingLabelEvidence === true;

const hasViewedOrder = (order: FulfillmentOrderShape): boolean =>
  !!order.viewedAt || !!order.seenAt || order.isSeen === true;

export function getOrderFulfillmentStatus(order: FulfillmentOrderShape): OrderFulfillmentStatus {
  const manual = isFulfillmentStatus(order.manualFulfillmentOverride) ? order.manualFulfillmentOverride : null;
  if (manual) return manual;
  if (order.fulfillmentShippedAt) return 'shipped';
  if (hasShippingLabelEvidence(order)) return 'label_created';
  if (hasViewedOrder(order)) return 'label_needed';
  return 'new_order';
}

export function getOrderFulfillmentBadgeMeta(order: FulfillmentOrderShape): {
  key: OrderFulfillmentStatus;
  label: string;
  className: string;
} {
  const key = getOrderFulfillmentStatus(order);
  const classNameByStatus: Record<OrderFulfillmentStatus, string> = {
    new_order: 'bg-blue-50 text-blue-700 border border-blue-100',
    label_needed: 'bg-amber-50 text-amber-700 border border-amber-100',
    label_created: 'bg-purple-50 text-purple-700 border border-purple-100',
    shipped: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  };
  return {
    key,
    label: ORDER_FULFILLMENT_LABELS[key],
    className: classNameByStatus[key],
  };
}
